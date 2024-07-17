import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import * as path from 'path';
import * as fs from 'node:fs/promises';

// Root folder where all the statics are copied to
const wwwroot = './views';

export async function serve_static(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {

    // Sanitize request.url.split('/') and asign const path1, path2, path3
    const paths = new URL(request.url).pathname.split('/').filter((subPath) => !["", "api"].includes(subPath));

    const fileMap = {
        'assets/css': {
            fileName: `${wwwroot}/api/assets/${paths.length > 1 ? paths[1] : 'undefined'}`,
            contentType: 'text/css; charset=utf-8'
        },
        'assets/js': {
            fileName: `${wwwroot}/api/assets/${paths.length > 1 ? paths[1] : 'undefined'}`,
            contentType: 'application/javascript; charset=UTF-8'
        },
        // 'manifest.json/undefined': {
        //     fileName: `${wwwroot}/assets/manifest.json`,
        //     contentType: 'application/json; charset=UTF-8'
        // },
        'favicon.ico/undefined': {
            fileName: `${wwwroot}/api/favicon.ico`,
            contentType: 'image/png'
        }
    };

    const filename_split = (paths.length > 1) ? paths[1].split(".") : [];
    const mapEntry = (filename_split.length > 1) ? fileMap[`${paths[0]}/${filename_split[filename_split.length - 1]}`] : fileMap[`${paths[0]}/undefined`];

    if (!!mapEntry) {
        context.info("[SERVING]:", mapEntry);
        try {
            return { body: await fs.readFile(mapEntry.fileName), headers: { 'Content-Type': mapEntry.contentType } };
        } catch (e) {
            console.error(e);
            return { status: 500 };
        }
    } else {
        context.info('[SERVING] index.html');
        try {
            const body = await fs.readFile(`${wwwroot}/index.html`);
            return {
                body, headers: { 'Content-Type': 'text/html; charset=UTF-8' }
            };
        } catch (e) {
            console.error(e);
            return { status: 500 };
        }
    };
}



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
