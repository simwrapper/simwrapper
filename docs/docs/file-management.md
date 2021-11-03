---
id: file-management
title: File Management
---

**SimWrapper** is essentially a very fancy file browser that works on the web. It allows you to browse the files and subfolders in the file storage areas you configure:

- for VSP, everything in our public subversion server is accessible. Check it out here: [simwrapper.github.io/public-svn](https://simwrapper.github.io/public-svn)
- You can also view files on your local computer by running a tiny file server locally!
- If you have mounted remote cluster file systems on your machine, then you can see those, too.

## TU-Berlin: Public-SVN file server

The main SimWrapper site can be used to view all project folders on the VSP public-svn server. If you have write access to public-svn, you can create your own project folders there for your own simulations, too.

## Internet/cloud storage

SimWrapper can be configured to use any Internet storage that can serve up file and folder listings similar to Apache or NGINX. Currently, this means public storage only; no authenticated storage. _[to be enhanced in the future!]_

- To set up SimWrapper for internet storage, you need to fork SimWrapper and set up your own instance, then define your storage endpoint in the file `src/fileSystemConfig.js` following the examples there.

- If you do not yet have your own instance of SimWrapper set up, follow the instructions [here](aftersim-installation.md).

**Amazon AWS** You can set up access to Amazon EC2/EFS file storage by following this guide: <https://docs.aws.amazon.com/efs/latest/ug/wt2-apache-web-server.html>

## Local folders on your computer

You can access files on your local computer by running a small file server app on "localhost:8000". You can set any folder on your computer as the root folder, and then SimWrapper will have access to anything in that folder and subfolders below it. Only you will have access to these files: they are not network- or internet-accessible.

> Nothing is sent over the network to simwrapper.github.io: this is 100% a client-side app that runs in your browser.

We have local file servers written in Java and Python. Pick whichever one you are more comfortable with:

**Python:** - this should work with Python 2.7 or 3.x:

1. Download [mini-file-server.py](https://raw.githubusercontent.com/simwrapper/simwrapper.github.io/source/scripts/mini-file-server.py) and save somewhere useful, like your home directory.
2. `cd` to the root folder you wish to serve, and then run the command
3. `/path/to/mini-file-server.py` or `~/mini-file-server.py` if it's in your home directory
4. Test that it's working by browsing to <http://localhost:8000>. If you see a file listing, then it is working! 🎉 🎉

**Java:**

Run the .jar file directly:

1. Download [mini-file-server.jar](https://github.com/simwrapper/mini-file-server/raw/master/bin/mini-file-server.jar) and run with the command
2. `java -jar mini-file-server.jar [rootfolder]`
3. If you don't provide a root folder, mini-file-server will serve the folder from which you run the command. That may or may not be what you want!
4. On Windows you can double-click the .jar file to run it and serve the folder it is in.
5. Test that it's working by running the server and browsing to <http://localhost:8000>. If you see a file listing, then it is working! 🎉 🎉

On Mac, if you want to double-click the file to run (instead of opening a terminal every time):

1. Download [mini-file-server-mac](https://github.com/simwrapper/mini-file-server/raw/master/bin/mini-file-server-mac)
2. Open a terminal and find the file _(probably Downloads folder)_ and issue the command
   - `chmod +x mini-file-server-mac` to make it executable
3. Move/copy it to the folder you want to serve, and you can now double-click to start the server
4. Test that it's working by running the server and browsing to <http://localhost:8000>. If you see a file listing, then it is working! 🎉 🎉

## Viewing files on the TU math cluster or other remote machines

You can "virtually" mount remote filesystems using the tool `sshfs`. It creates an ssh tunnel to the remote machine using your username/login credentials, and mounts the files it finds there under a subfolder on your machine.

Once the sshfs tunnel is established, you can browse the files there as if the files are local on your machine, as above.

---

Please send feedback if you have trouble or suggestions on how to make this better! I'm glad you're here! -- [Billy](https://github.com/billyc)
