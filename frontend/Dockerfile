# Base images are pinned by digest so a rebuild can't silently pull a different image. The tag
# is kept for readability; to update, look up the tag's new digest and bump both together.
FROM node:26-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Vite bakes VITE_* env vars into the build output, so they must be
# available at build time, not just at container run time.
ARG VITE_API_BASE_URL=http://localhost:8080/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# Unprivileged variant of the official nginx image: runs as the nginx user (uid 101) and
# listens on 8080, since non-root processes can't bind ports below 1024.
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b9241c6e7b8e9a862f129d8d4199ab64b10390949a78bdd5603379b32c844083
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
# Origin of the backend API, allowed in the CSP's connect-src. Override at run time.
ENV API_ORIGIN=http://localhost:8080
EXPOSE 8080
