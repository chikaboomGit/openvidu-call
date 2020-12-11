[![License badge](https://img.shields.io/badge/license-Apache2-orange.svg)](http://www.apache.org/licenses/LICENSE-2.0)
[![Documentation Status](https://readthedocs.org/projects/openviduio-docs/badge/?version=stable)](https://docs.openvidu.io/en/stable/?badge=stable)
[![Docker badge](https://img.shields.io/docker/pulls/fiware/orion.svg)](https://hub.docker.com/r/openvidu/openvidu-call/)
[![Support badge](https://img.shields.io/badge/support-sof-yellowgreen.svg)](https://openvidu.discourse.group/)

[![][OpenViduLogo]](http://openvidu.io)

openvidu-call
===

Visit [openvidu.io/demos](http://openvidu.io/demos#3)

[OpenViduLogo]: https://secure.gravatar.com/avatar/5daba1d43042f2e4e85849733c8e5702?s=120

[Documentation](https://docs.openvidu.io/en/latest/demos/openvidu-call/)


git clone https://github.com/chikaboomGit/openvidu-call.git

docker build -f docker/custom.dockerfile -t callr10 --build-arg  BASE_HREF=/ . --network=host

docker save callr10 > callr10.tar


Modified for many user in lan environments

- font cached
- webrtc resolution cahged to 320x240 20fps
- need to cahge docker-compose.override.yml
- for lan user need to change docker-compose.yml
  - 'export COTURN_IP=`/usr/local/bin/discover_my_public_ip.sh` -> 'export COTURN_IP=`100.100.100.100`
  - nginx entryporint need to added
    - entrypoint: ['/bin/bash','-c','echo "echo "\"100.100.100.1"\""" > /usr/local/bin/discover_my_public_ip.sh; /usr/local/bin/discover_my_public_ip']