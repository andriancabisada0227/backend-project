#!/bin/bash
set -xe


# Copy war file from S3 bucket to tomcat webapp folder
aws s3 cp s3://schoolryde-staging/core.tar.gz /tmp
tar -xf /tmp/core.tar.gz -C /home/ubuntu/schoolryde
cd /home/ubuntu/schoolryde
sudo chown -R ubuntu:ubuntu *

