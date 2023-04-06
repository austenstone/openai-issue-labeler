import * as core from '@actions/core';
import * as github from '@actions/github';
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types';
import { Configuration, OpenAIApi } from 'openai';
import fs from 'fs';
interface TrainingData {
  prompt: string;
  completion: string;
}

type ClientType = ReturnType<typeof github.getOctokit>;

const train = async (client: ClientType): Promise<TrainingData[]> => {
  const examples: TrainingData[] = [];
  const maxExampleLength = 4096;
  const trim = (str): string => str.substring(0, maxExampleLength);

  const issuesResponse = await client.rest.issues.listForRepo({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
  });
  issuesResponse.data.forEach((i) => {
    i.labels
      .map((l) => (typeof l === 'string') ? l : l.name)
      .filter((l): l is string => typeof l === 'string')
      .forEach((label: string) => {
        if (i.title) examples.push({
          prompt: trim(i.title),
          completion: label,
        });
        if (i.body) examples.push({
          prompt: trim(i.body),
          completion: label,
        });
      });
  });

  let labelsResponse: RestEndpointMethodTypes['issues']['listLabelsForRepo']['response'];
  labelsResponse = await client.rest.issues.listLabelsForRepo({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
  });
  if (labelsResponse.data.length < 1) throw new Error(`No labels found for repo ${github.context.repo.owner}/${github.context.repo.repo}`);
  labelsResponse.data.forEach((label) => {
    if (label.description && label.description.length > 0) {
      examples.push({
        prompt: trim(label.description),
        completion: label.name,
      });
    }
  });

  return examples;
};

const run = async (): Promise<void> => {
  const FILE_NAME = 'foo.jsonl';
  if (!github.context) return core.setFailed('No GitHub context.');
  if (!github.context.payload) return core.setFailed('No payload. Make sure this is an issue event.');
  if (!github.context.payload.issue) return core.setFailed('No issue found in the payload. Make sure this is an issue event.');
  const token = core.getInput('token');
  const key = core.getInput('openai-api-key');
  if (!token) return core.setFailed('No input \'token\'');
  if (!key) return core.setFailed(`No input 'openai-api-key'. Set secret 'OPENAI_API_KEY' that you create https://beta.openai.com/account/api-keys.`);

  const client: ClientType = github.getOctokit(token);
  const issue = github.context.payload.issue;
  if (!issue) return core.setFailed('No issue in event context');

  const trainingData = await train(client);

  const configuration = new Configuration({ apiKey: key });
  const openai = new OpenAIApi(configuration);

  let id: string;
  const fineTuneModels = await openai.listFineTunes();
  const existingFineTuneModel = fineTuneModels.data.data.find((model) => (model.training_files.find((file) => file.filename === 'foo.txt')));
  if (existingFineTuneModel) {
    const fineTuneModel = await openai.retrieveFineTune(existingFineTuneModel.id);
    id = fineTuneModel.data.id;
  } else {
    console.log('Creating new fine-tune model')
    fs.writeFileSync(FILE_NAME, JSON.stringify(trainingData));
    const fineTuneFile = await openai.createFile(
      fs.createReadStream(FILE_NAME) as any,
      'fine-tune'
    );
    const fineTuneModel = await openai.createFineTune({
      model: 'ada',
      training_file: fineTuneFile.data.filename,
    })
    id = fineTuneModel.data.id;
  }
  const completion = await openai.createCompletion({
    model: id,
    prompt: `${issue.title}`
  });
  console.log(completion.data);
  const label = completion.data.choices[0].text;

  if (issue.number && label) {
    try {
      await client.rest.issues.addLabels({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: issue.number,
        labels: [label],
      });
    } catch {
      return core.setFailed(`Error adding label '${label}' to issue ${issue.number}`);
    }
  }
};

run();