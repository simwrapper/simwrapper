# Build fly.io machine for running tests using this Dockerfile
# (because GH Actions is waaay to slow now)

# NOTE!! To build you need to copy these things into the .flyio folder:
# pnpm-lock.yaml
# pnpm-workspace.yaml
# patches/

# And get everything built with:
# fly deploy --image-label latest

FROM ubuntu:24.04

RUN apt-get update \
    && apt-get install -y curl jq git ca-certificates build-essential libicu-dev sudo \
    && rm -rf /var/lib/apt/lists/*

# Set up user "runner" to run everything instead of root
RUN useradd -m runner
RUN mkdir -p /home/runner/actions-runner && chown runner:runner /home/runner/actions-runner
# make sure runner can do sudo passwordless
RUN echo "runner ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# GitHub Actions runner
USER runner
WORKDIR /home/runner/actions-runner
ARG RUNNER_VERSION=2.336.0

RUN curl -o runner.tar.gz -L \
    https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz
RUN tar xzf runner.tar.gz && rm runner.tar.gz

USER root
RUN /home/runner/actions-runner/bin/installdependencies.sh

# flyctl so the machine can destroy itself
RUN curl -L https://fly.io/install.sh | sh
ENV FLYCTL_INSTALL="/root/.fly"
ENV PATH="$FLYCTL_INSTALL/bin:$PATH"

# node/pnpm for the build
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs
# ENV PNPM_HOME="/opt/pnpm"
# ENV PATH="$PNPM_HOME:$PNPM_HOME/bin:$PATH"
# RUN mkdir -p /opt/pnpm/bin && chmod -R 777 /opt/pnpm
# RUN npm install -g pnpm
# RUN pnpm config set store-dir /opt/pnpm/store --global

# prepopulate pnpm database
# COPY pnpm-lock.yaml /tmp/pnpm-lock.yaml
# COPY pnpm-workspace.yaml /tmp/pnpm-workspace.yaml
# COPY patches /tmp/patches
# RUN cd /tmp && pnpm fetch --frozen-lockfile
# RUN chown -R runner:runner /opt/pnpm

# playwright
# ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
# RUN mkdir -p /opt/playwright-browsers && chmod -R 777 /opt/playwright-browsers
RUN npx playwright install --with-deps chromium firefox webkit
# RUN chown -R runner:runner /opt/playwright-browsers

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
