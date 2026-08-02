# M16 acceptance (technical-plan §5): prove the published tarball installs and runs a full
# mission inside a clean image with nothing but Node + npm/npx available.
FROM node:20-slim

WORKDIR /smoke

# The build context is tests/smoke/ plus the packed tarball copied in by run-smoke.sh.
# Copy the tarball first so the install layer caches independently of the driver/data.
COPY inglorious-mustard.tgz ./
RUN npm init -y >/dev/null 2>&1 && npm install ./inglorious-mustard.tgz

# Sanity: the bin resolves and --version works from the installed package (exercises the
# import.meta.url -> package.json resolution that packing can break).
RUN npx mustard --version && npx mustard --help >/dev/null

# The offline engine driver + its canned mission data.
COPY smoke-driver.mjs habit-tracker.mission.json ./

# Drive the full seven-phase habit-tracker mission from the installed engine. Zero tokens.
CMD ["node", "smoke-driver.mjs"]
