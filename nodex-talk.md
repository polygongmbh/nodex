# Nodex Talk

Over the past few months, Nodex has grown immensely.
All that work is not in vain.

But as we prepare to onboard the first external customers,
it is important to create a streamlined, simple, convincing, robust experience
especially for mobile.

That is why I want us to take a moment to strip away everything about tasks,
so that rather than getting lost in polishing a very broad spectrum of use-cases,
we focus on one particular aspect that has been one of the founding blocks of Nodex:
Being a better Teamchat, a better Slack/Discord/Zulip.

Primary Use-Case: Messaging and Events on Mobile

## The User Experience

- Registration / Sign In on Nodex via Noas API
- Onboarding: asking the user which channels they care about and setting up their profile (for now, one profile across spaces, in the future space specific profiles possible)
- Starting the application, seeing the content you care about:
  + Messages mentioning you
  + Top-level content from channels you are subscribed to (with indicators for replies, like in Slack, maybe even folding out reddit-style)
- For now, reducing everything to just the Timeline view, maybe Calendar if it earns its place
  
-> to post, select a channel and a space (unless there is only one space, or the channel has posts only in one space -> auto-selection)

UI Simplifications:
- spaces as a dropdown (comparison: Slack/Discord server selection in desktop app, but with multi-view option)
- no need for channel match mode -> always AND, the idea of OR is now absorbed into the Pinned/Home feed it was meant for all along
- composer only visible when channel(s) selected
- no post type picker - by default a message, options of adding attachments including files and calendar events 
  -> in the future, attachments can include tasks which then only the task part shows up in task views, from which you can also create pure tasks

## What makes Nodex a better messenger?

- threading of replies - no more intertwined conversations in group chats
- data ownership and portability

## What makes Nodex a better Teamchat?

- multi-channel posts - no more being member of everything to not miss anything
- multi-server view & accounts - no need for juggling many accounts and switching between servers
- posting of events -> direct calendar sync
- public posts -> serves as social media / newsfeed e.g. for website (kiosk mode?)

# Next Steps

## Design
- Onboarding flow (plus optional step: connecting your calendar, maybe linking a separate guide)
  + Hey NAME, welcome onboard ORG Nodex! Let's take a quick moment to personalize your experience.
  + Let's setup your profile: profile picture, displayname, optionally Bio
  + Which channels would you like to see in your main feed?
  + Would you like to connect your calendars? (can we provide a link to the right settings page for each OS? otherwise just a guide page I guess)
- Intuitive UI reminiscent of messaging - familiar experience without losing Nodex' flair; with new color scheme

## Nodex Development
- automatic user experience with regards to channels and spaces
- updated composer
- implementing adjusted design and colors
