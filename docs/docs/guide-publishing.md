---
id: guide-publishing
title: 4. Publishing to the web
---

OK so you've curated your model runs, post-processed all your results, and built your pretty dashboards! Now you want to show them to people.

We are experimenting with several different ways of publishing results to the open web. Please send us feedback on which of these methods works best for you, or if some other way of getting things online would be better.

## Speedrun: Host your site on fly.io

There are many, many hosting options on the web but we have found that https://fly.io is the most developer-friendly and has an extremely generous free tier, so it's a great place to start. They seem to have taken what Heroku used to be good at, and made it better.

Fly.io free tier currently (May 2022) includes:

- 5 Gb storage
- 3 (or 10?) site URLs
- 100 GB data transfer per month free, then $0.02/Gb over

Thus, you only need to watch the outbound data transfer to keep your site free. This service doesn't have any redundancy or fault-tolerance, so keep local copies of all your files in case their data center explodes or catches on fire.

### First time setup

1. Install the `flyctl` utility with [these instructions](https://fly.io/docs/getting-started/installing-flyctl/) but it is really this simple:

   - Mac: `brew install flyctl`
   - Linux: `curl -L https://fly.io/install.sh | sh`
   - Windows: `iwr https://fly.io/install.ps1 -useb | iex`

2. Then run **`flyctl auth signup`** to open a browser and set up your account. Yes, you need a credit card but it's free if you stay within the limits above.
3. No step 3!

### Push your site

Now that `flyctl` is set up on your machine you can launch your first site!

1. Clone the git repo at `https://github.com/simwrapper/simwrapper-example-project` which has the Dockerfile for SimWrapper ready to go
2. Copy your project folder -- everything you want published -- into the local `data` folder inside that repo
3. Run `flyctl launch` and answer the questions:
   - Give your site a useful name or it will give you something random
   - Choose the datacenter; Frankfurt is a nice choice for Germany
   - You do NOT need a database
   - Yes, launch it now!

That's it. It will take a few minutes to upload all your files and provision the site, and then... that's it; it's live at **your-site-name.fly.dev**

There are ways to give it your own domain name, etc. See the [fly.io/docs](https://fly.io/docs) for all the details.

### Password-protect your site

To password-protect a SimWrapper site using standard HTTP Basic authentication, use the program `htpasswd` to generate a username/password file named `.htpasswd` and copy that file into the root of the built site using Docker. Github Pages does not support this; you need to use a real web host such as Fly.io etc. that honors basic authentication.

`htpasswd` is installed by default on Mac OS and is part of `openssh` for other platforms.

1. Use the program `htpasswd` to create username/password pairs you need:

- `htpasswd -c .htpasswd [username]` and then enter the desired password. This will create/overwrite the file `.htpasswd`
- If you need more than one user, drop the `-c` from the command and run again for each user: `htpasswd .htpasswd [anotheruser]`

2. Add one line to the end of the Dockerfile, to copy the file into the root folder of the site:

- `COPY .htpasswd  /`

3. Now run `flyctl launch` as above.

## Docker-based sites

SimWrapper has been packed up into a Docker image at `simwrapper/site`, which is nothing more than the NGINX proxy server with the latest SimWrapper code embedded, all carefully configured to have the correct settings for serving the site and data you provide.

On Docker Hub, we created the `simwrapper/site` docker image which can be used anywhere that supports Docker. If you have Docker installed on your local machine, or if you have a cloud provider that lets you run Docker images, then you don't need anything other than:

`docker run -p 8080:8080 -v ~/my/data/folder:/data simwrapper/site`

That's it! Note that in the command above we mount a local volume to the image at `/data` which is where SimWrapper expects your files to be. For a cloud site, you would need to put that in accessible storage somewhere. If you already know Docker, you already know how to do this.

## GitHub Pages ( + Your own file server)

Github is not a great place to store large files; it has a hard limit of 100Mb on file sizes, and generally doesn't work well for files over 20Mb either. So, yes the SimWrapper website code and assets themselves can be served from any static site provider at all, such as Github Pages. But your model outputs might need to go somewhere else.

- At VSP, we have a departmental Subversion server that is set up and maintained for us. The only settings we needed to tweak were to add "CORS Headers" which allow unfettered access to the site from other websites (e.g. SimWrapper)

- An NGINX proxy server is probably a more common choice if you don't already have Subversion lying around for some reason.

- **For this to work,** you need to create your own build of SimWrapper and edit the `src/fileSystems.ts` file to point to your file server URL. Push that build to Github Pages.

### Outline of instructions for using GitHub Pages

You can make your own clone of the SimWrapper website and host it yourself on GitHub Pages, including all of your data files (if they are each < 100Mb in size). 

It will be hosted at yourusername.github.io/simwrapper, or you can rename your clone to use a different endpoint slug other than "/simwrapper".

- Clone the SimWrapper Repo at <https://github.com/simwrapper/simwrapper.git>
- Copy all of your data files and configuration YAMLs into the `public/data` subfolder
- You must edit two files, to tell GitHub what the endpoint of the URL is: 
  - `vite.config.js`: change the `base` to be whatever your repo name is. For example to host things at "username.github.io/simwrapper", change this to `base: '/simwrapper/'`.
  - `public/404.html`: change the `meta` refresh content value to show `"0;URL='/simwrapper/'"
- Run `npm run build`
- Your site is now built in the local `dist` subfolder.
- Push the content of that `dist` folder to a new `gh-pages` branch in your repo:

```bash
cd dist
git init .
git add . && git commit -m "gh-pages"
git remote add origin git@github.com:username/reponame.git # Put your username/reponame here
git push --force origin master:gh-pages
```

Be sure to enable GitHub pages for your repo, and point it to the `gh-pages` branch.

This worked as of fall 2021, if you have problems or things are broken let us know!


### CORS Headers

These are the CORS headers needed for Apache or NGINX web servers. These allow external websites to access the files on your server over HTTP.

**Your files will be visible on the Internet, so don't put things there that should not be public.**

```
add_header Access-Control-Allow-Origin "*";
add_header Access-Control-Allow-Headers "Accept-Ranges,Range,*";
add_header Accept-Ranges "bytes";
```

### NGINX Settings

Here is an example configuration for NGINX, which includes the correct CORS headers as well as the needed index.html redirection for single-page-app URLs to work properly.

- The commented out section kills all caching; this was helpful for SFCTA which had their files on internal Windows servers.

```
server {
  # ...
  # you already have a server section
  # ...

  location / {
   try_files $uri $uri/ =404;
  }

  location /champ_runs/ {
    # Enable CORS and range requests for partial file downloads
    add_header Access-Control-Allow-Origin "*";
    add_header Access-Control-Allow-Headers "Accept-Ranges,Range,*";
    add_header Accept-Ranges "bytes";
    autoindex on;

    # optional: kill cache for the champ_runs windows share
    # add-header Last-Modified $date_gmt;
    # add-header Cache-Control 'private no-store, no-cache, must-revalidate,
    # proxy-revalidate, max-age=0';
    # add-header Pragma 'no-cache';
    # if_modified_since_off;
    # expires 0;
    # etag off;
  }

  location /simwrapper/ {
    # Redirect long URLs to the app index file which will handle them correctly
    try_files $uri $uri/ /simwrapper/index.html;
  }

# end server section
}
```
