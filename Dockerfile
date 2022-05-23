FROM nginx:alpine

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/htpasswd /etc/nginx/htpasswd

COPY dist/ /usr/share/nginx/html

