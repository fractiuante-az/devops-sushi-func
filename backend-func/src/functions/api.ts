import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";


export async function api(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.info('HTTP trigger function processed a request.');
    return { body: JSON.stringify({ message: "Hello from API" }), headers: { 'Content-Type': 'application/json' } };
};

app.http('post_id', {
    route: 'post/{postId}',
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: api
});

app.http('timeline', {
    route: 'timeline',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: api
});
