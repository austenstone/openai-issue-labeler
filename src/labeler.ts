import * as core from '@actions/core';
import * as github from '@actions/github';
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types';
import { Configuration, CreateClassificationRequest, CreateClassificationResponse, OpenAIApi } from 'openai';
import { AxiosResponse } from 'axios';

type ClientType = ReturnType<typeof github.getOctokit>;

const run = async (): Promise<void> => {
  if (!github.context) return core.setFailed('No GitHub context.');
  if (!github.context.payload) return core.setFailed('No payload. Make sure this is an issue event.');
  if (!github.context.payload.issue) return core.setFailed('No issue found in the payload. Make sure this is an issue event.');
  const token = core.getInput('token');
  const key = core.getInput('openai-api-key');
  const temperature = parseInt(core.getInput('temperature'), 10);
  const model = core.getInput('model');
  const searchModel = core.getInput('search-model');
  const client: ClientType = github.getOctokit(token);
  const issue = github.context.payload.issue;
  const ownerRepo = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
  };
  const examples: string[][] = [];
  const maxExampleLength = 4096;
  const trim = (str): string => str.substring(0, maxExampleLength);

  if (!token) return core.setFailed('No input \'token\'');
  if (!key) return core.setFailed(`No input 'openai-api-key'. Set secret 'OPENAI_API_KEY' that you create https://beta.openai.com/account/api-keys.`);
  if (!issue) return core.setFailed('No issue in event context');

  core.startGroup('Issue');
  core.info(JSON.stringify(issue, null, 2));
  core.endGroup();

  let issuesResponse: RestEndpointMethodTypes['issues']['listForRepo']['response'];
  try {
    issuesResponse = await client.rest.issues.listForRepo(ownerRepo);
  } catch {
    return core.setFailed(`Error getting issues for repo ${ownerRepo.owner}/${ownerRepo.repo}`);
  }
  const issues = issuesResponse.data;
  issues.forEach((i) => {
    i.labels
      .map((l) => (typeof l === 'string') ? l : l.name)
      .filter((l): l is string => typeof l === 'string')
      .forEach((label: string) => {
        if (i.title) examples.push([trim(i.title), label]);
        if (i.body) examples.push([trim(i.body), label]);
      });
  });

  let labelsResponse: RestEndpointMethodTypes['issues']['listLabelsForRepo']['response'];
  try {
    labelsResponse = await client.rest.issues.listLabelsForRepo(ownerRepo);
  } catch {
    return core.setFailed(`Error getting issues for repo ${ownerRepo.owner}/${ownerRepo.repo}`);
  }
  if (labelsResponse.data.length < 1) return core.setFailed(`No labels found for repo ${ownerRepo.owner}/${ownerRepo.repo}`);
  const labels = labelsResponse.data.map((label) => label.name);
  labelsResponse.data.forEach((label) => {
    if (label.description && label.description.length > 0) {
      examples.push([trim(label.description), label.name]);
    }
  });

  const query = `${issue.title || ''}
${issue.body || ''}
${issue.labels.map((l) => l.name)?.join(' ') || ''}`;

  const classificationRequest: CreateClassificationRequest = {
    search_model: searchModel,
    model,
    temperature,
    query,
    labels,
    examples,
  };

  core.startGroup('Classification Request');
  core.info(JSON.stringify(classificationRequest, null, 2));
  core.endGroup();

  const configuration = new Configuration({ apiKey: key });
  const openai = new OpenAIApi(configuration);

  let classificationResponse: AxiosResponse<CreateClassificationResponse>;
  try {
    classificationResponse = await openai.createClassification(classificationRequest);
  } catch (err) {
    return core.setFailed(String(err));
  }
  const classification = classificationResponse.data;
  if (!classification.label) return core.setFailed('No label found in classification response');
  core.notice(`Issue labeled as '${classification.label}'`);

  if (issue.number && classification.label) {
    try {
      await client.rest.issues.addLabels({
        ...ownerRepo,
        issue_number: issue.number,
        labels: [classification.label],
      });
    } catch {
      return core.setFailed(`Error adding label '${classification.label}' to issue ${issue.number}`);
    }
  }
};

export default run;
