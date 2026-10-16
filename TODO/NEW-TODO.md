# Enter new todo requests

New requests, one per section so they can be bulk created.


## Switch to turn off dev mcp server

When I'm testing the webmcp server in chrome, I don't want the mcp server running in the dev (or preview) server running.  It's good to leave it on by default, but I'd like to have a switch to turn it off.

## Investigate bundle size

WHen building we get the following warning:

dist/assets/index-BtLJbCWu.js                                 1,812.57 kB │ gzip: 541.04 kB

[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.

We should look to see if any of these suggestions will improve load times.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
