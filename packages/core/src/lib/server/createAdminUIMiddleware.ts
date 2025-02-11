import url from 'url';
import path from 'path';
import express from 'express';
import type next from 'next';
import type { KeystoneConfig, KeystoneContext } from '../../types';
import { pkgDir } from '../../pkg-dir';

const adminErrorHTMLFilepath = path.join(pkgDir, 'static', 'admin-error.html');

function defaultIsAccessAllowed({ session, sessionStrategy }: KeystoneContext) {
  if (!sessionStrategy) return true;
  return session !== undefined;
}

export function createAdminUIMiddlewareWithNextApp(
  config: KeystoneConfig,
  commonContext: KeystoneContext,
  nextApp: ReturnType<typeof next>
) {
  const handle = nextApp.getRequestHandler();

  const {
    ui: { isAccessAllowed = defaultIsAccessAllowed, pageMiddleware, publicPages = [] } = {},
  } = config;

  return async (req: express.Request, res: express.Response) => {
    const { pathname } = url.parse(req.url);

    if (pathname?.startsWith('/_next') || pathname?.startsWith('/__next')) {
      return handle(req, res);
    }

    try {
      // do nothing if this is a public page
      const isPublicPage = publicPages.includes(pathname!);
      const context = await commonContext.withRequest(req, res);
      const wasAccessAllowed = isPublicPage ? true : await isAccessAllowed(context);
      const shouldRedirect = await pageMiddleware?.({
        context,
        wasAccessAllowed,
      });

      if (shouldRedirect) {
        res.header('Cache-Control', 'no-cache, max-age=0');
        res.header('Location', shouldRedirect.to);
        res.status(302);
        res.send();
        return;
      }

      if (!wasAccessAllowed) return nextApp.render(req, res, '/no-access');

      handle(req, res);
    } catch (e) {
      console.error('An error occurred handling a request for the Admin UI:', e);
      res.status(500);
      res.format({
        'text/html': function () {
          res.sendFile(adminErrorHTMLFilepath);
        },
        'application/json': function () {
          res.send({ error: true });
        },
        default: function () {
          res.send('An error occurred handling a request for the Admin UI.');
        },
      });
    }
  };
}
