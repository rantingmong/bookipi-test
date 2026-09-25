# REST REQUEST authorizer prototype

This isolated prototype checks whether LocalStack `2026.8.4` Hobby invokes a REST API Gateway REQUEST authorizer.

It uses the pinned image `localstack/localstack:2026.8.4`, a separate Compose project, and port `14566`. It does not change the main local stack. Both Lambda functions use Node.js 24.

The runner rejects a LocalStack version other than `2026.8.4`. It runs Compose cleanup even when startup fails. A cleanup error does not replace the original run error.

The authorizer accepts the local token `allow-probe` and denies every other value. It does not log token values. The backend returns the trusted authorizer context that API Gateway supplies.

## Run

Create `.localstack` in the repository root. Store the raw LocalStack auth token in that ignored file. Do not display or copy the token into another file.

Run the prototype with Node 24 or later:

```sh
node infra/localstack/prototypes/rest-request-authorizer/runner.mjs
```

The runner starts an isolated LocalStack service, deploys the CloudFormation template, and tests direct Lambda Allow and Deny calls. It then tests API Gateway Allow and Deny calls. It prints the LocalStack version, edition, and license activation state. It prints no token, cookie, or event payload. It stops its Compose project when the run ends.

The API endpoint uses the recommended LocalStack execute-api host form:

```text
http://rest-request-authz-proof.execute-api.localhost.localstack.cloud:14566/local/probe
```

## Proof

The runner checks the deployed method and authorizer settings. It prints the authorizer URI and checks that it targets the authorizer Lambda. It compares safe CloudWatch log marker counts before and after each request. It checks the backend response and marker count for both tokens.

The observed run uses a Hobby auth token with LocalStack `2026.8.4:f26fc4d36`. The info endpoint reports `edition=pro` and `licenseActivated=true`. It does not report the Hobby plan name.

The runner reports these safe results:

```text
LOCALSTACK version=2026.8.4:f26fc4d36 edition=pro licenseActivated=true
METHOD authorization=CUSTOM type=REQUEST identitySource=method.request.header.x-prototype-token ttl=0 uri=arn:aws:apigateway:ap-southeast-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-southeast-1:000000000000:function:rest-request-authz-proof-authorizer/invocations
DIRECT-ALLOW effect=Allow markerCount=0->5
DIRECT-DENY effect=Deny markerCount=5->10
ALLOW status=200 authorizerMarker=10->10 backend=invoked body=backend-invoked context=absent
DENY status=200 authorizerMarker=10->10 backend=invoked body=backend-invoked context=absent
PROOF authorizerEnforcement=not-enforced-or-incompatible
CLEANUP complete
```

The direct authorizer calls emit safe markers and return the expected policies. The API Gateway calls do not invoke the authorizer. They both invoke the backend and return HTTP 200. This result does not prove production AWS behavior.

The LocalStack info endpoint can report the image edition and license activation state. It may not report the Hobby plan name. The repository owner supplies a Hobby auth token for this run.

This prototype proves only LocalStack behavior. It does not prove AWS API Gateway behavior.
