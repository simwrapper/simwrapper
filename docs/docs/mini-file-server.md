---
id: mini-file-server
title: Mini File Server
---

To view files that are either **local on your computer** or on **shared network drives** that you view on your computer through your regular filesytem, you can use Mini File Server!!

## New Python package: simwrapper!!!

> You can now run `pip install simwrapper` to install a command-line tool which can launch mini-file-server for you.

The new `simwrapper` command has two features:

- `simwrapper serve` - Starts mini-file-server in your current folder. This is exactly the same as running the old mini-file-server.py script yourself.
- `simwrapper open [vsp|asim]` - Starts a mini-file-server running in your current folder **AND OPENS A BROWSER TAB** to either the VSP or ASIM site, so you can immediately view results.

Note that due to browser constraints, in either case you can only see & access files in current folder or below; so file paths with `"../../blah"` won't work if you try to go above the launch folder.

_You can still install the mini-file-server python script yourself if you want to; those directions are below._

## Using Mini File Server

> Quick Link: Download Python **[mini-file-server.py](https://raw.githubusercontent.com/simwrapper/simwrapper/master/scripts/mini-file-server.py)** here

Mini File Server is a tiny Python or Java program that runs on your local machine and allows the SimWrapper website to see the files. Nothing leaves your computer: it is all served locally from the client-side app.

- See [File Management](file-management.md) for other ways to access server-based and cloud-storage files with SimWrapper!

You can access files on your local computer by running a small file server app which responds at URL "http://localhost:8000". You can set any folder on your computer as the root folder, and then SimWrapper will have access to anything in that folder and all subfolders below it. Only you will have access to these files: they are not network- or internet-accessible.

> Nothing is sent over the network to simwrapper.github.io: this is 100% a client-side app that runs in your browser.

Mini File Server is available as a Java .jar and as a Python script. Pick whichever one you are more comfortable with:

---

### Python

This should work with Python 2.7 or 3.x:

1. Download [mini-file-server.py](https://raw.githubusercontent.com/simwrapper/simwrapper/master/scripts/mini-file-server.py) and save it somewhere useful, like your home directory.
2. `cd` to the root folder you wish to serve, and then run the command
3. `/path/to/mini-file-server.py` or `~/mini-file-server.py` if it's in your home directory
4. Test that it's working by browsing to <http://localhost:8000>. If you see a file listing, then it is working! 🎉 🎉

---

### Java

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

---

## Using Mini File Server to view files on remote machines<br/>(such as the TU math cluster)

You can "virtually" mount remote filesystems using the tool `sshfs`. It creates an ssh tunnel to the remote machine using your username/login credentials, and mounts the files it finds there under a **subfolder** on your machine.

Once the sshfs tunnel is established, you can browse the files in that subfolder as if the files are local on your machine, as above.

---

Please send feedback if you have trouble or suggestions on how to make this better! I'm glad you're here! -- [Billy](https://github.com/billyc)
