# OpenAI Issue Labeler 🤖


> **Warning**
> The classification API is deprecated. Need to replace it with https://platform.openai.com/docs/guides/fine-tuning

This GitHub [action](https://docs.github.com/en/actions) labels issues using [OpenAI's Classification API](https://beta.openai.com/docs/guides/classifications) powered by GPT-3 models! We are using [`curie`](https://beta.openai.com/docs/engines/curie) as our completion model and [`ada`](https://beta.openai.com/docs/engines/ada) as the search model.

It uses your existing [labels](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels) and past GitHub [issues](https://docs.github.com/en/issues) to train a model that can predict the labels of new issues. When someone opens a new issue this action will automatically label it.

## Requirements
You will need to sign up for the [OpenAI API](https://openai.com/api/) and get an [OpenAI API Key](https://beta.openai.com/account/api-keys).

Add this OpenAI API Key as a secret called `OPENAI_API_KEY`. See [Creating encrypted secrets for a repository](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository).

## Usage
Create a workflow (eg: `.github/workflows/labeler.yml`). See [Creating a Workflow file](https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file).

#### Default Workflow
```yml
name: "OpenAI Issue Labeler"
on:
  issues:
    types: [opened, edited]

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: austenstone/openai-issue-labeler@v2
        with:
          openai-api-key: "${{ secrets.OPENAI_API_KEY }}"
```
That's it. Your issues are now labeled by powerful AI models! 🧠

![RobotDancingDanceGIF](https://user-images.githubusercontent.com/22425467/151486237-5a416561-c2e9-4c61-ad56-12d77fca0206.gif)

## Input Settings
Various inputs are defined in [`action.yml`](action.yml) to let you configure the labeler. See the [Classifications API reference](https://beta.openai.com/docs/api-reference/classifications) for more information.

| Name | Description | Default |
| --- | - | - |
| **openai&#x2011;api&#x2011;key** | The OpenAI API key secret | N/A |
| token | Token to use to authorize label changes. | ${{&nbsp;github.token&nbsp;}} |
| temperature | Higher values mean the model will take more risks. | `0`
| model | ID of the engine to use for completion. You can select one of ada, babbage, curie, or davinci. | `curie`
| search&#x2011;model | ID of the engine to use for Search. You can select one of ada, babbage, curie, or davinci. | `ada`

## How?
The model uses Labeled data to classify the new piece of data.

### Inputs
1. All repository labels
3. Examples of past label usage
    - Label description and label
    - Issue title and label
    - Issue body and label
4. A query to find a label for
    - New Issue title
    - New Issue body

### Outputs
The label! It will be automatically added to your issue.

This [workflow](https://github.com/austenstone/openai-issue-labeler/actions/workflows/usage.yaml) runs on this repo. Check out the [issues](https://github.com/austenstone/openai-issue-labeler/issues) and feel free to open a new one.

#### Example Issues
- [We need to add a rate limiter to login](https://github.com/austenstone/openai-issue-labeler/issues/80)
- [Where are the docs?](https://github.com/austenstone/openai-issue-labeler/issues/37)
- [Logo in the navbar needs to be bigger](https://github.com/austenstone/openai-issue-labeler/issues/36)

