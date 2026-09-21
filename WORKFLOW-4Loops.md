I want you to continue for 4 loops of running the full cloud sweep including compilation. Each loop includes:

- Run the full cloud sweep including compilation, setting up a notification for completion
- On completion, if there were no failures or errors, launch another run
- If there were failures or errors, investigate and fix them, once tests pass commit and push, then launch another run

Be careful in fixes to fix for the general case without focussing too much on the specific situation you encountered. The purpose here is to make sitelooper as robust as possible against all future runs on different web apps.

Don't ask me for confirmation or input during this process unless essential.