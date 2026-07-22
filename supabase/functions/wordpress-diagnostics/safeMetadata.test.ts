import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  DiagnosticError,
  safeErrorBody,
} from './errors.ts'

import {
  createHandler,
} from './handler.ts'

import {
  createWordPressClient,
} from './wordpressClient.ts'

function client(
  fetchImpl: typeof fetch,
  options: {
    maxResponseBytes?: number
  } = {},
) {
  return createWordPressClient({
    baseUrl:
      new URL(
        'https://wordpress.example.com/',
      ),
    username: 'api-user',
    applicationPassword:
      'abcd efgh',
    fetchImpl,
    ...options,
  })
}

async function captureError(
  promise: Promise<unknown>,
): Promise<DiagnosticError> {
  try {
    await promise
  }
  catch (error) {
    expect(error).toBeInstanceOf(DiagnosticError)

    return error as DiagnosticError
  }

  throw new Error('Expected promise to reject.')
}

describe(
  'safe WordPress upstream diagnostics metadata',
  () => {
    it(
      'identifies an HTML response without returning body, headers, URL, or credentials',
      async () => {
        const privateBody =
          '<html>private-upstream-body</html>'

        const privateHeader =
          'private-upstream-header'

        const response =
          new Response(
            privateBody,
            {
              status: 403,
              headers: {
                'content-type':
                  'text/html; charset=utf-8',
                'content-length':
                  String(
                    new TextEncoder()
                      .encode(privateBody)
                      .byteLength,
                  ),
                'x-private-header':
                  privateHeader,
              },
            },
          )

        const error =
          await captureError(
            client(
              vi.fn<typeof fetch>()
                .mockResolvedValue(response),
            ).get('discovery'),
          )

        expect(error).toMatchObject({
          code:
            'WORDPRESS_RESPONSE_INVALID',
          diagnostics: {
            endpoint: 'discovery',
            failurePhase:
              'content_type',
            upstreamStatus: 403,
            contentType: 'text/html',
            contentLength:
              new TextEncoder()
                .encode(privateBody)
                .byteLength,
            bytesReceived:
              new TextEncoder()
                .encode(privateBody)
                .byteLength,
            responseOverLimit: false,
          },
        })

        const serialized =
          JSON.stringify(
            safeErrorBody(error),
          )

        expect(serialized)
          .not.toContain(privateBody)

        expect(serialized)
          .not.toContain(privateHeader)

        expect(serialized)
          .not.toContain('api-user')

        expect(serialized)
          .not.toContain('abcdefgh')

        expect(serialized)
          .not.toContain(
            'wordpress.example.com',
          )

        expect(serialized)
          .not.toContain('authorization')
      },
    )

    it(
      'identifies invalid JSON and reports the endpoint and received byte count',
      async () => {
        const invalidJson =
          '{"private":"not-closed"'

        const error =
          await captureError(
            client(
              vi.fn<typeof fetch>()
                .mockResolvedValue(
                  new Response(
                    invalidJson,
                    {
                      status: 200,
                      headers: {
                        'content-type':
                          'application/json',
                      },
                    },
                  ),
                ),
            ).get('user'),
          )

        expect(error).toMatchObject({
          code:
            'WORDPRESS_RESPONSE_INVALID',
          diagnostics: {
            endpoint: 'user',
            failurePhase:
              'json_parse',
            upstreamStatus: 200,
            contentType:
              'application/json',
            bytesReceived:
              new TextEncoder()
                .encode(invalidJson)
                .byteLength,
            responseOverLimit: false,
          },
        })

        expect(
          JSON.stringify(
            safeErrorBody(error),
          ),
        ).not.toContain(invalidJson)
      },
    )

    it(
      'distinguishes a streamed response body limit from other response failures',
      async () => {
        const privateBody =
          JSON.stringify({
            private:
              'x'.repeat(200),
          })

        const stream =
          new ReadableStream<
            Uint8Array
          >({
            start(controller) {
              controller.enqueue(
                new TextEncoder()
                  .encode(privateBody),
              )

              controller.close()
            },
          })

        const error =
          await captureError(
            client(
              vi.fn<typeof fetch>()
                .mockResolvedValue(
                  new Response(
                    stream,
                    {
                      headers: {
                        'content-type':
                          'application/json',
                      },
                    },
                  ),
                ),
              {
                maxResponseBytes: 20,
              },
            ).get('posts'),
          )

        expect(error).toMatchObject({
          code:
            'WORDPRESS_RESPONSE_INVALID',
          diagnostics: {
            endpoint: 'posts',
            failurePhase:
              'response_body_limit',
            upstreamStatus: 200,
            contentType:
              'application/json',
            responseOverLimit: true,
          },
        })

        expect(
          error.diagnostics
            ?.bytesReceived,
        ).toBeGreaterThan(20)

        expect(
          JSON.stringify(
            safeErrorBody(error),
          ),
        ).not.toContain(privateBody)
      },
    )

    it(
      'serializes only the approved diagnostic fields through the Edge Function response',
      async () => {
        const values:
          Record<string, string> = {
            WORDPRESS_SITE_URL:
              'https://wordpress.example.com',
            WORDPRESS_USERNAME:
              'api-user',
            WORDPRESS_APPLICATION_PASSWORD:
              'application-secret',
            WORDPRESS_ALLOWED_USER_ID:
              '11111111-1111-4111-8111-111111111111',
            APP_ALLOWED_ORIGINS:
              'https://app.example.com',
          }

        const privateBody =
          '<html>private-edge-response</html>'

        const privateHeader =
          'private-edge-header'

        const fetchImpl =
          vi.fn<typeof fetch>()
            .mockResolvedValue(
              new Response(
                privateBody,
                {
                  status: 403,
                  headers: {
                    'content-type':
                      'text/html; charset=utf-8',
                    'x-private-header':
                      privateHeader,
                  },
                },
              ),
            )

        const handler =
          createHandler({
            environment: {
              get: (name) =>
                values[name],
            },
            verifyCaller:
              vi.fn()
                .mockResolvedValue({
                  id:
                    values
                      .WORDPRESS_ALLOWED_USER_ID,
                }),
            fetchImpl,
          })

        const request =
          new Request(
            'https://functions.example.com/wordpress-diagnostics',
            {
              method: 'POST',
              headers: {
                origin:
                  'https://app.example.com',
                authorization:
                  'Bearer valid-token',
                'content-type':
                  'application/json',
              },
              body:
                JSON.stringify({
                  action: 'diagnose',
                }),
            },
          )

        const response =
          await handler(request)

        const body =
          await response.json()

        const serialized =
          JSON.stringify(body)

        expect(response.status)
          .toBe(502)

        expect(body)
          .toMatchObject({
            schemaVersion: 1,
            ok: false,
            error: {
              code:
                'WORDPRESS_RESPONSE_INVALID',
              diagnostics: {
                endpoint: 'discovery',
                failure_phase:
                  'content_type',
                upstream_status: 403,
                content_type:
                  'text/html',
                response_over_limit:
                  false,
              },
            },
          })

        expect(
          Object.keys(
            body.error.diagnostics,
          ).sort(),
        ).toEqual([
          'bytes_received',
          'content_length',
          'content_type',
          'endpoint',
          'failure_phase',
          'response_over_limit',
          'upstream_status',
        ])

        for (
          const forbidden
          of [
            privateBody,
            privateHeader,
            'application-secret',
            'api-user',
            'valid-token',
            'wordpress.example.com',
            'authorization',
            'stack',
          ]
        ) {
          expect(serialized)
            .not.toContain(forbidden)
        }
      },
    )
  },
)