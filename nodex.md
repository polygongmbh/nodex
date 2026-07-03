![An Initial Nodex Concept Art](./nodex-logo-v9.svg)

# [Nodex](https://nodex.nexus)

## The Heart of Nodex / Basic Tenets
Empower individuals and communities to express themselves, communicate across cultures, and coordinate seamlessly.

Provide multiple interfaces to the same decentral data, built around the common navigational concept of context-awareness.

Rather than constraining context to rigid hierarchies:

- should this receipt or report go into the project folder or the finance folder? 
- does a request about accounting software go into finance or the IT section?

in Nodex, just put it in both! Without awkward cross-posts like in Slack etc.

Nodex makes context a first-class concept, preserving hierarchies to constitute ownership: tidying my desk is part of todays apartment cleanup, formatting is the final task to finish the report, generally subtasks and comments belong to their parent comments / tasks

for nerds: this is similar to object-oriented programming languages - using ancestry to share commonalities is problematic, it should represent an is-a relationship, with interfaces and helpers providing concept

## Design
The current design of Nodex grew organically as Janek developed it:
From the original years-long vision of a tags-first hierarchical, infinitely nestable task manager (Tree View) built on the top of the nostr protocol,
to focusing on more collaborative views and post types.

### Story
Initially there were only tasks in an infinite hierarchy,
with the ability to add comments instead of a description and status updates rather than editing the task itself,
which avoids conflicts in asynchronous workflows and provides a full history.
This concept was implemented in 2024 with the command-line application [mostr](https://github.com/polygongmbh/mostr).
To this day, mostr and nodex connecting to the same nostr relay can share almost all post types and task attributes,
in itself a testament of portability.
This grew out of years of testing and evaluating different task managers,
never finding quite the right fit: <https://github.com/xeruf/nodal>

![Nostr Chat Idea](./nostr-chat.png)

The Timeline (formerly Feed) view came in as an idea 
that started in December 2025 as "Nostr Chat"
out of frustrations with the limitations of Zulip, Discord, Slack
and common messenger applications.
Initially intended to be a separate, related application,
I soon found it more practical to implement it as another view within the same application
as it shared so many underlying concepts.

By then I realized the parallels to [Vikunja](https://vikunja.io/features/) as a multi-view task manager,
and the benefits of having those different views in one application for quick switching especially on the web.
So I decided to add in a Kanban and Calendar view to complement what was there.

### Current Situation
Over the last months,
Nodex has acquired many extra features,
and the design of the interface has been informed by a feature-centric developers perspective,
creating overwhelm for common users.

Though a few principles have stayed consistent throughout:

- a focus on the content and simple initial navigation, with power-user features quickly accessible for those who want to use them, without adding noise (e.g. the idea of clicking on a hashtag name vs the hashtag itself)
- this has made mobile very minimalistic, with just a top navigation and a bottom bar, which unifies both search and post filtering / context selection and post creation (maybe switching these would make sense?)
- exposing just enough of the underlying nostr protocol for advanced users, without making it confusing for those who do not care about nostr
- more user-friendly intuitive names focusing on usage rather than technical concepts (tags as channels, relays as spaces)
- offers and requests are only auxiliary (only shown in Timeline), the main post types are task and comment (shown in Timeline and Tree, everything else shows only tasks)

### Design Strategy
At least for the next few weeks, work on the design will proceed in two parallel tracks. 
Recently, unclarity about those two tracks has created confusion:
"suggest improvements for issues you notice" and "rethink the whole interface" are two different tracks -
for the former, subjective input is enough, for the latter, we need user research and alignment.

We have the subjective iterative track of noticing issues with the implementation we have currently, that are specific and small and fixable, and suggesting an improvement.
I do this almost daily: adjusting the timestamp format, adjusting the layout and the elements on the task cards as well as styling of elements or, as Mariana suggested, removing the user public keys entirely from the feed.

And then we have the more visionary long-term evidence-based design lane of gathering information from how people use Nodex, how we intend Nodex to be used, what people struggle with fundamentally in the design concept and pouring that into a complete overhaul of the design. 

Both tracks are essential: 
quick fixes keep the product functional, while long‑term research drives sustainable improvements.

#### 1. Subjective Iterative Track
- Focuses on spotting specific, small, fixable issues in the current implementation.
- Operates on a daily, hands‑on basis.

The new color scheme may be included here, 
but it may also be deferred into the reworked layout if that is more practical.

#### 2. Visionary Long‑Term Evidence‑Based Track
- Relies on gathering user data and intended usage patterns of Nodex.
- Identifies fundamental design challenges and informs a comprehensive redesign.
- Emphasizes research, user behavior analysis, and strategic overhaul.

This is currently focused on mobile,
incorporating feedback from our team,
early experimenters,
and using personas that we develop based on our intended target audiences.

---

## Nodex Core Features

### Most suitable competitor: Notion
- **Limitations of Notion:**
  - Poor integration with calendars, task lists, and other personal tools.
  - Relies on a file‑based metaphor, causing fragmentation and duplication.
- **Nodex advantage:** Protocol‑driven integrations and a fundamentally different information model.

### Tag‑Based, Information‑Centric Model
- One piece of information can exist simultaneously in multiple contexts via tags.
- Updates propagate automatically, eliminating copy‑paste and version drift.
- Moves away from hierarchical wiki pages; content grows organically and remains alive.
- Encourages thriving individuals by reducing bureaucratic friction and fostering seamless, passionate work.

### Integrations
- Existing proof of concept for Apple Reminders.
- Straightforward pathways to connect calendar apps, messaging platforms, email, and other tools.

### Upcoming Offline Capability & Sync Architecture
- Data stored as JSON objects on a **Nostr relay** (can be exported as single text file).
- Users can sync a few megabytes of data locally for full offline operation.
- Sync works like Dropbox/Drive or a git repository, with minimal conflict risk; any conflict typically reflects a communication issue, not a tool flaw.

## Future Ideas
- Moves away from hierarchical wiki pages; content grows organically and remains alive (subtasks to posts) -
  dynamic knowledge base that is both permanent and tag‑driven.
- canvas of nostr posts
- gantt & project views
- light nostr events for status updates etc?

---

---

~~~~ Extra unpolished notes ~~~~ 

---

---

# Polygon
## Vision & Culture
- **Vision:** A peaceful world built on healthy, diverse communities where individuals can thrive.
- **Community values:** Mutual respect, freedom to share beliefs, and support for personal conditions.
- **Work‑life philosophy:** Work is an extension of passion, not a separate compartment; ideas develop spontaneously anytime

## Nodex Purpose for independence
- **Platform goal:** Empower both individuals and communities to express themselves, communicate across cultural barriers, and coordinate.
- **Primary Users:** teams, activists, organizations, nerds needing a resilient, independent platform
- **Why needed:** Existing services (Discord, Slack, WhatsApp, Notion, etc.) can be compromised by external pressures; Nodex remains in the hands of its users.
- Supports NGOs as a stable backbone for collaboration, resistant to external interference.

# Transcript
I have coined a new and ambitious vision statement that says a peaceful world with healthy communities and thriving individuals. It sounds very generic and broad, but for me, it encompasses a lot of what I envision. The big picture peaceful world is fairly self-explanatory, but it's essential to see how that starts with individuals and the impact we can make there. The most tangible aspect right now is the element of healthy communities, and that in multiple senses.

The idea is that I'm developing a point in that direction, and the team I want to build with you is part of that. Healthy communities are diverse communities and communities brought together from different standpoints, where people respect each other and are free to share and thrive as individuals because they're respected by the community with their beliefs, values, and conditions.

I want to build a culture where, while we work towards that vision, everybody involved is already empowered to thrive, independent of the outputs we create. And while I cannot address or support every personal challenge you might have, I do my best to respect them and account for them. I do not believe in the fundamental distinction between work and personal life, because ideally, work is something you're passionate about, and if you're passionate about it, it occupies you outside of predetermined times and scopes. That is what I experience most of the time, which is why you receive messages on weekends and in the middle of the night.

For me, work is not separate from life, and that is an important aspect of what it means to thrive. Now, when it comes to thriving individuals and healthy communities, we have some concrete projects that work in that direction. When it comes to Nodex, it can empower both individuals and communities by being a platform and a tool that helps them express themselves, communicate, ideally cross cultural barriers, and coordinate. Especially, I want to highlight supporting efforts that support a peaceful world, making Nodex a tool that can be the backbone of NGOs.

I have realized that there's nobody who really does that. I've heard of NGOs using Discord, probably Notion, Slack, WhatsApp, and Telegram are all in the mix there. But if an NGO gets in conflict with government incentives, those services can easily betray them. However, Nodex, being in the hands of the people, is supposed to be fundamentally theirs.

It's also supposed to be a tool to empower individuals by redefining what knowledge management means. The biggest comparison we can find is Notion. Notion is used by individuals, teams, businesses, and organizations, even my university. So, it has that broad user base that I envisioned for Nodex as well. However, it is lacking some things that, for me, have always been critical, which ultimately made me move off of Notion.

It was not integrating with the other things I use in my life. It was not integrating with my calendar, task list, or knowledge base. That is where Nodex is supposed to be different. Because of the protocol it uses, it can be integrated with just about anything. We have a proof-of-concept integration for Apple Reminders and a straightforward path to build integration with calendar apps. Integrations with messaging apps, email, or different communication elements are also not far off.

The core of Nodex and what sets it apart is the ability to have one piece of information in multiple places. When I was using Notion, for example, one thing I struggled with is having an idea, a quote, or a note that I want to have in multiple places. Maybe it should be part of my journal, a blog article, or an essay I was writing. And I had to copy that piece of information over. What if that idea was something that was changing or maybe it was a note about how to do something, and I realized I would now do that differently? I had to update it independently.

With Nodex, you don't, because fundamentally, one piece of information can live in multiple places at the same time with that tag-based concept. It goes away from the file-based metaphor, which shapes so many tools we use today, including Notion and virtually every document and collaboration platform. Information is always fragmented into projects, lists, channels in Slack or Zulip, pages or Notion, files on your computer. But Nodex takes a different approach where the pieces of information come first and can be composed and reconnected, recombined into something bigger.

There are a lot of vision elements I have for that. One element that would be very handy for us, for example, is an element of a knowledge base. So, you don't just have posts that float away, but you have permanent pages, kind of like a wiki. But instead of having the typical hierarchy of pages that a wiki often has, it is tag-based and information-centric like Nodex, so it can be very alive. You don't have to have big wiki pages, and then you have to decide which information goes on what page. You can grow things out organically, and they can live in multiple places.

Another thing that complements that is full offline capability. Nodex runs on a Noster relay, which fundamentally just has a list of JSON objects. That's how your data lives. Now, that might sound technical, but what it means is you just have your data that is shown in Nodex essentially in one big text file. And depending on how much data it is, it may be more or less text, depending on how detailed the data is that you want to have locally.

Do you want to have every update to every task? Or maybe just the most recent data? Either way, we're usually talking about a few megabytes of data. And you can keep all that data in sync locally on your computer and then use Nodex entirely offline with the data on your computer. So, you have a backup, a way of working offline. The best thing is that as soon as you come online, just like when you work with a file sync client like Dropbox or Drive on your computer, everything can just be synced to the online relay.

A bit like a git repository as well. But the difference is there is virtually no possibility of creating conflicts. Even if you work on the same task, the chance of creating conflicts is very low. And if they do arise, there's usually an organizational issue rather than an issue with the tool. Like, if you mark a task as done and somebody else marks it as to-do, then something has gone wrong in your communication, and the tool will just take whatever state was last put there. Either way, it will find an element of correctness.

# Walled Gardens
A conversation about the limitations of mainstream messaging tools, the importance of replaceability for healthy communities and technology, and how the Nodex platform addresses these issues through the NOSTA protocol.

## Critique of WhatsApp
- Operates as a **walled garden**; does not foster peace, healthy communities, or thriving individuals.  
- Relies on a massive user base to keep users logged in, which is **unsustainable**.  
- Functionally replaceable by any other messenger, provided contacts also switch.

## Apple and Replaceability
- Apple devices are **high‑quality** but not replaceable in the same sense; they have health and sustainability concerns.  
- The concept of replaceability is central: a tool should be **interchangeable** without loss of core functionality.

## Replaceability, Sustainability, and Community Health
- **Replaceable tools** are akin to resilient ecosystems (e.g., multiple smiths in a village).  
- GMO crops illustrate a failure of true replaceability: seeds must be repurchased each year, hindering **sustenance**.  
- Healthy communities depend on **multiple actors** and the ability to substitute them when needed.

## Nodex Design & NOSTA Protocol
- Built to be **replaceable** and **portable** from the start.  
- Does **not store data**; data resides in a NOSTA relay, allowing:
  - Seamless migration between relays.  
  - Immediate data portability without a login system.  
- Extensible: any client can implement extensions; Nodex adds only minimal tweaks.  
- Benefits from the **wide adoption** of the NOSTA protocol, enabling cross‑client interaction (e.g., viewing Nodex posts in any NOSTA app).

## Relation to Matrix
- Matrix has multiple implementations but suffers from **centralization concerns** linked to its funding origins.  
- Nodex avoids these issues by leveraging an already decentralized protocol (NOSTA) rather than relying on a single controlling entity.

## Conclusion
The discussion emphasizes that **replaceability** is essential for sustainable technology and thriving communities. Nodex, powered by the NOSTA protocol, exemplifies this principle by offering a truly portable, decentralized messaging solution.

## Revision
- **Nostalgia vs. Modern Dependency**  
  - Past life was simpler, cheaper, and healthier.  
  - Today’s “get‑kept” state creates a longing for that feeling.

- **Need for Relatable Connection**  
  - Effective storytelling must find a “connective tissue” that evokes nostalgia.  
  - The author felt love and life in the words but couldn’t relate to them.

- **Empowerment Paradox**  
  - Products (e.g., WhatsApp, Nodex) give a sense of empowerment, yet also impose constraints.  
  - The tension lies between feeling empowered and being “tightened up” by the platform.

## The Smith Analogy
- **Village Setting**  
  - Isolated mountain village discovers new materials and brings them to a solitary smith.  
  - The smith crafts superior tools, repairs, and continuously improves them, though he never teaches anyone.

- **Dependency Cycle**  
  - Villagers rely on the smith’s tools; each repair also upgrades the tool.  
  - When the smith dies, the village loses the ability to maintain or create tools.

- **Shift of Power**  
  1. Villagers stockpile minerals to ensure steady tool production.  
  2. A trader offers the smith wealth beyond the village’s means.  
  3. The smith accepts, takes all minerals, and distributes tools at his discretion, leaving the village dependent on his generosity.

## Parallel to Modern Tech Platforms
- **WhatsApp & Apple**  
  - Like the smith, these companies provide powerful tools that users depend on.  
  - Over time, control shifts to the platform, limiting user autonomy.

- **Consequences**  
  - Users may be forced to accept superior but monopolistic tools.  
  - The desired world is one of healthy, sustainable employment rather than reliance on a single provider.
