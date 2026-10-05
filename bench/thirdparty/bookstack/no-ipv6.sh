#!/bin/sh
# Boxes without IPv6 (docker daemon ipv6 off) make nginx die on "listen [::]:80".
sed -i '/listen \[::\]/d' /config/nginx/site-confs/default.conf 2>/dev/null || true
