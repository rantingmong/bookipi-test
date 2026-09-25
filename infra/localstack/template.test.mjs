import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('local checkout uses the combined checkout Lambda as an unauthenticated proxy', async () => {
  const template = await readFile(
    new URL('./template.yaml', import.meta.url),
    'utf8',
  )
  assert.match(template, /Handler: dist\/local-handler\.handler/)
  assert.match(template, /AuthorizationType: NONE/)
  assert.match(template, /functions\/\$\{CheckoutProcessor\.Arn\}\/invocations/)
  assert.match(template, /BETTER_AUTH_SECRET: !Ref BetterAuthSecret/)
  assert.match(template, /BETTER_AUTH_URL: http:\/\/bookipi\.localhost:3200/)
  assert.doesNotMatch(template, /Type: AWS::ApiGateway::Authorizer/)
  assert.doesNotMatch(template, /CheckoutAuthorizer/)
  assert.match(
    template,
    /AllowApiGatewayCheckoutInvoke:[\s\S]*?FunctionName: !Ref CheckoutProcessor[\s\S]*?Principal: apigateway\.amazonaws\.com/,
  )
  assert.match(template, /BetterAuthSecret:[\s\S]*?NoEcho: true/)
})

test('the processor role only writes logs and sends order events', async () => {
  const template = await readFile(
    new URL('./template.yaml', import.meta.url),
    'utf8',
  )
  const role = template.match(
    /CheckoutProcessorRole:[\s\S]*?CheckoutProcessor:/,
  )?.[0]
  assert.ok(role)
  assert.match(role, /logs:CreateLogStream/)
  assert.match(role, /Action: sqs:SendMessage/)
  assert.match(role, /Resource: !GetAtt OrderEventsQueue\.Arn/)
  assert.doesNotMatch(role, /lambda:InvokeFunction/)
})
