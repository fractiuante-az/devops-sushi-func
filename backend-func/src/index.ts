import { app } from '@azure/functions';
import { api } from './functions/api';
import { serve_static } from './functions/serve_static';

app.setup({
    enableHttpStream: true,
});

app.http("post_id", {
    route: "post/{postId}",
    methods: ["GET", "POST"],
    authLevel: "anonymous",
    handler: api,
});

app.http("timeline", {
    route: "timeline",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: api,
});

app.http("post_create", {
    route: "post/create/{postId}",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: api,
});

app.http('favicon', {
    route: 'favicon.ico',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: serve_static
});

app.http('assets', {
    route: 'assets/{asset}',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: serve_static
});

app.http('serve_static', {
    route: 'home',
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: serve_static
});
