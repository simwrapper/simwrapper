# SVN Server settings

We use a Subversion server at VSP for our internal project file storage.

- `public-svn` has no authentication and is world-readable
- `runs-svn` is username/pw protected: has various run outputs; and is generally for internal use only
- `shared-svn` is username/pw protected: and people outside VSP are often given access to specific folders

## What is CORS?

CORS is a system which protects server assets from external sites accessing them. The default basically denies everything; in our case, we want our website to be able to access files on SVN even if they are behind authentication.

For this to work, we need to change CORS settings on the Apache server which sits in front of SVN.

Here is some info on what CORS is and how it behaves:

- for a great description of what CORS is:
  - https://javascript.info/fetch-crossorigin
- How to set up CORS for our exact use case
  - https://stackoverflow.com/questions/42558221/how-to-cors-enable-apache-web-server-including-preflight-and-custom-headers
- Longer explanation of what's going on here:
  - https://benjaminhorn.io/code/setting-cors-cross-origin-resource-sharing-on-apache-with-correct-response-headers-allowing-everything-through/

## Recipe: how to set up CORS to work for our use case

Add these lines to the apache server config for `svn.vsp.tu-berlin.de` -- this allows authentication through CORS.

```bash
# allow cross-site requests
Header always set Access-Control-Allow-Origin "*"
# allow GET requests only --
# Verify SVN: doesn't need POST,PUT,HEAD,OPTIONS,DELETE?
Header always set Access-Control-Allow-Methods "GET"
# allow Authorization headers (with username/password)
Header always set Access-Control-Allow-Headers "Authorization"

# This rewrite responds with a 200 SUCCESS on the OPTIONS request
# This tells the browser it can try to use auth, which is harmless
RewriteEngine On
RewriteCond %{REQUEST_METHOD} OPTIONS
RewriteRule ^(.*)$ $1 [R=200,L]
```
