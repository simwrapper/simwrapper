---
id: guide-cloud-storage
title: Network/cloud storage
---

There are many ways to connect SimWrapper to cloud storage, and we have worked with several agencies that had different needs and requirements. This page summarizes our findings from those implementations.

_This is work in progress, more to come_

## Internal file server

At VSP / TU Berlin, we have a huge on-premise file server for storing MATSim runs. The server runs Apache as a front-end, with Subversion managing updates. Subversion is old, yes, but it works very well with the enormous file sizes that MATSim produces (especially compared to "modern" solutions like Git).

With this setup, Apache/subversion provide a web front-end to the directory and file system. SimWrapper then can be configured to point to this as a base URL for its Data Source.

This approach has worked well since the inception of SimWrapper and continues as the primary file storage for VSP.

## SSHFS -- mount an SSH system

Also at VSP there is a supercompute "cluster" to which we only have SSH access.

Every desktop OS has a way to mount SSH files using something like "SSHFS", the SSH filesystem. Search on `SSHFS [your OS]` to find the right solution for your situation.


## AWS S3 / Microsoft Azure / Other Clouds

The many giant cloud providers all have some file storage solution under various marketing names. We spent a lot of time trying to connect to AWS S3 and Azure in particular; and while those solutions worked, they felt like a lot of extra effort for the big players, and then we hadn't addressed NextCloud or any of the other players.

And then we found [RClone.org](https://rclone.org/) which provides an open-source solution to mounting more than 70 different cloud providers' data storage as a local folder mount on your server/computer.

RClone has an "rclone mount" program which mounts file or "blob" storage _as if it is local_ but does not actually have to sync any files until you request them. It even allows partial file syncs, which is absolutely ideal for giant OMX/HDF5 files of multiple gigabytes in size (but which users generally only look at a small slice). Details such as cache size, number of threads, and timeouts are all configurable.

Not only does using RClone mean we can support ALL cloud service providers, but in practice it turned out to be faster an more reliable that the cloud vendors own file-mount products.

### Using Rclone

The short version is:

- Run `rclone config` to specify which cloud provider you want to connect to, and to provide all of the authentication details needed. This file can be encrypted, supports two-factor auth, and more. The authentication information is stored locally on your server. Each config can be named, such as `AZURE-MODEL-STORAGE`
- Then run `rclone mount` to mount a specific config to a folder of your choosing in your filesystem.

The mount command has many, many configuration options to optimize and experiment with here. The example below shows one set of parameters that worked well for us with Azure.

The mount can be set up as an autostart program using `systemd` on linux so that the storage even survives server reboots.

**Example rclone command**
```bash
rclone mount AZURE-MODEL-STORAGE: /mnt/azure \
  --read-only \
  --fast-list \
  --no-modtime \
  --vfs-cache-mode full \
  --vfs-fast-fingerprint \
  --vfs-cache-max-age 7d \
  --vfs-cache-max-size 5G \
  --vfs-read-chunk-size 1M \
  --vfs-read-chunk-streams 16
```

We will add more details to this page as we get more experience with the various cloud vendors.
