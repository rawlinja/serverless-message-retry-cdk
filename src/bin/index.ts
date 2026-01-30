#!/usr/bin/env node
import 'source-map-support/register'
import { App } from 'aws-cdk-lib'
import { BaseStack } from '@stacks/base-stack'

const app = new App()
new BaseStack(app, 'BaseStack', {
  env: { region: 'us-east-1' },
})
