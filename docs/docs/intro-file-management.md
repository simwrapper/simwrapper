---
id: file-management
title: File management
---

**SimWrapper** doesn't have a back-end database; it reads the files in folders that you give it access to.

Depending on where your files are, this may require some configuration!

- At TU Berlin, everything in our public subversion server is already accessible. Check it out here: [vsp.berlin/simwrapper](https://vsp.berlin/simwrapper)
- You can view files on your local computer, see below
- If you have SSH access to network compute-cluster servers, you can mount the remote filesystems and they behave as if they are local; see below
- You can also set up remote file storage on cloud servers such as Amazon etc.

## Local folders on your computer

**Easy version:** Use Google Chrome or Microsoft Edge to access files on your local machine. These two browsers have a built-in file access API which lets you grant access to a folder for viewing, and then everything just works. From the SimWrapper home page, click `Add Local folder...` to get started.

**Hard version:** Other browsers (Safari, Firefox, others) block local file access by default. The only way to access local files is by running a small local HTTP server on "localhost:8000". This works for all browsers but Safari has additional measures which make it the worst choice for this.

For these reasons, we strongly recommend using Google Chrome (or Edge if that's your thing)

We formerly supported both Python and Java versions of this HTTP server, but now only the Python 3.x version is supported.

**Python:** this should work with Python 3.6+:

1. Run `pip3 install simwrapper` to install the simwrapper command-line tool. If you don't have `pip` installed, you'll need to get that set up in your Python environment first.
2. `cd` to the folder you wish to serve, and then run the command
3. `simwrapper serve`
4. Test that it's working by browsing to <http://localhost:8000>. If you see a file listing, then it is working 🎉 🎉
5. You can now go to the SimWrapper website and choose "Local files" to browse your folders inside of SimWrapper!
5. You can run multiple copies of the SimWrapper Python tool in separate root folders if you wish. Each one will run on the next port, so localhost:8001, localhost:8002, etc.

## Mounting remote file systems -- cluster compute services etc

You can "virtually" mount remote filesystems using the tool `sshfs`. It creates an ssh tunnel to the remote machine using your username/login credentials, and mounts the files it finds there under a subfolder on your machine.

Once the sshfs tunnel is established, you can browse the files there as if the files are local on your machine, as above.

- Linux: install `sshfs` and follow your OS instructions for how to mount remote filesystems
- Mac: Use [MacFUSE](https://osxfuse.github.io/) to set up sshfs
- Windows: [WinFSP](https://winfsp.dev/) may provide this; please let me know if this works for you


## Internet/cloud storage

SimWrapper can be configured to use any Internet storage that can serve up file and folder listings similar to Apache or NGINX. Currently, this means public storage only; no authenticated storage. _[to be enhanced in the future!]_

- To set up SimWrapper for internet storage, you need to fork SimWrapper and set up your own instance, then define your storage endpoint in the file `src/fileSystemConfig.js` following the examples there.

- If you do not yet have your own instance of SimWrapper set up, follow the [instructions here](dev-developing-simwrapper.md).

**Amazon AWS** You can set up access to Amazon EC2/EFS file storage by following this guide: <https://docs.aws.amazon.com/efs/latest/ug/wt2-apache-web-server.html>


---

Please send feedback if you have trouble or suggestions on how to make this better! I'm glad you're here! -- [Billy](https://github.com/billyc)
