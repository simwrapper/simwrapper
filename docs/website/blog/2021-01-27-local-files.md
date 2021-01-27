---
title: Using aftersim to explore local files on your PC/laptop
author: Billy Charlton
author_title: aftersim lead developer
authorURL: https://github.com/billyc
authorImageURL: https://avatars0.githubusercontent.com/u/1427526?v=4
tags: [tutorial]
---

You don't need to set up any file storage or upload outputs to subversion -- you can explore the files stored on your own laptop right away.

This is great for files that you cannot or do not yet want to make public.

All you need to do is run the **Mini File Server** on your local machine, in the root folder that you want aftersim to have access to. It's a simple HTTP web server that provides local access only on `localhost:8000`. Your machine's default firewall will prevent any outside network or internet access.

Once it's running, you can browse to [aftersim.github.io/local](https://aftersim.github.io/local) and explore the files and subfolders inside the directory in which you started the mini file server. Closing the server will stop sharing the files.

Now you can add and debug YAML files for visualizations you want to create for your model outputs!

Follow [these instructions on downloading and running the Mini File Server](https://aftersim.github.io/docs/docs/aftersim-intro#viewing-local-folders-on-your-computer) to get started! Let me know if you have trouble setting it up.
