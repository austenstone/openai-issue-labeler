import * as core from "@actions/core";
import * as github from "@actions/github";
import { Configuration, CreateClassificationRequest, OpenAIApi } from "openai";
type ClientType = ReturnType<typeof github.getOctokit>;

export async function run() {
    const token = core.getInput("token");
    const openAiApiKey = core.getInput("openai-api-key");
    const temperature = parseInt(core.getInput("temperature"));
    const model = core.getInput("model");
    const search_model = core.getInput("search-model");
    const client: ClientType = github.getOctokit(token);
    const currentIssue = github.context.payload.issue;
    const ownerRepo = {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
    };
    const examples: string[][] = []
    const maxExampleLength = 4096;
    const trim = (str) => str.substring(0, maxExampleLength)

    if (!token) return core.setFailed("No input 'token'");
    if (!openAiApiKey) return core.setFailed("No input 'openai-api-key'");
    if (!currentIssue) return core.setFailed("No issue in event context");

    core.startGroup('Issue')
    core.info(JSON.stringify(currentIssue, null, 2));
    core.endGroup()

    const issuesResponse = await client.rest.issues.listForRepo(ownerRepo)
    const issues = issuesResponse.data;
    issues.forEach((issue: any) => {
        issue.labels.map(l => l.name).forEach((label: string) => {
            if (issue.title) examples.push([trim(issue.title), label]);
            if (issue.body) examples.push([trim(issue.body), label]);
        });
    });

    const labelsResponse = await client.rest.issues.listLabelsForRepo(ownerRepo);
    const labels = labelsResponse.data.map(label => label.name);
    labelsResponse.data.forEach(label => {
        if (label.description && label.description.length > 0) {
            examples.push([trim(label.description), label.name]);
        }
    });

    const query = `${currentIssue.title}
${currentIssue.body}
${currentIssue.labels.map(l => l.name).join(' ')}`;

    const classificationRequest: CreateClassificationRequest = {
        search_model,
        model,
        temperature,
        query,
        labels,
        examples
    };

    core.startGroup('Classification Request');
    core.info(JSON.stringify(classificationRequest, null, 2));
    core.endGroup();

    const configuration = new Configuration({ apiKey: openAiApiKey });
    const openai = new OpenAIApi(configuration);

    let classificationResponse;
    try {
        classificationResponse = await openai.createClassification(classificationRequest);
    } catch (err) {
        return core.setFailed(String(err));
    }
    const classification = classificationResponse.data;
    core.notice(`Issue labeled as '${classification.label}'`);

    if (currentIssue?.number && classification.label) {
        await client.rest.issues.addLabels({
            ...ownerRepo,
            issue_number: currentIssue?.number,
            labels: [classification.label]
        });
    }
}