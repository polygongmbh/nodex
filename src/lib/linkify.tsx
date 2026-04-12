import React from "react";
import LinkifyIt from "linkify-it";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { LINKIFY_CONTENT_TOKEN_REGEX } from "@/lib/content-tokens";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import type { Person } from "@/types/person";
import { getMentionAliases, normalizeMentionIdentifier } from "@/lib/mentions";
import { guessMimeTypeFromUrl, isSafeHttpUrl } from "@/lib/attachments";
import i18n from "@/lib/i18n/config";
import {
  formatUserFacingPubkey,
  isHexPubkey,
  npubToHexPubkey,
  toUserFacingPubkey,
} from "@/lib/nostr/user-facing-pubkey";
import { PersonActionMenu } from "@/components/people/PersonActionMenu";
import { PersonHoverCard } from "@/components/people/PersonHoverCard";

const linkify = new LinkifyIt();

const HASH_LINK_PREFIX = "https://nodex.local/hashtag/";
const MENTION_LINK_PREFIX = "https://nodex.local/mention/";
const INLINE_TOKEN_CLASS =
  `${TASK_INTERACTION_STYLES.inlineLink} inline whitespace-normal break-all align-baseline p-0 border-0 bg-transparent font-inherit`;

function formatPubkeyMention(pubkey: string): string {
  return formatUserFacingPubkey(pubkey);
}

function resolveMentionPerson(identifier: string, people: Person[] | undefined): Person | null {
  if (!people || people.length === 0) return null;
  const normalizedIdentifier = normalizeMentionIdentifier(identifier);
  if (!normalizedIdentifier) return null;

  for (const person of people) {
    const aliases = getMentionAliases(person);
    if (aliases.includes(normalizedIdentifier)) {
      return person;
    }
  }

  return null;
}

function buildFallbackMentionPerson(identifier: string): Person | null {
  const normalizedIdentifier = normalizeMentionIdentifier(identifier);
  const pubkey = isHexPubkey(normalizedIdentifier)
    ? normalizedIdentifier
    : npubToHexPubkey(normalizedIdentifier);
  if (!pubkey) return null;

  const label = formatUserFacingPubkey(pubkey);
  return {
    id: pubkey,
    name: label,
    displayName: label,
    isOnline: false,
    isSelected: false,
  };
}

interface LinkifyOptions {
  plainHashtags?: boolean;
  people?: Person[];
  onStandaloneMediaClick?: (url: string) => void;
  getStandaloneMediaCaption?: (url: string) => string | undefined;
  disableStandaloneEmbeds?: boolean;
}

const IMAGE_MIME_PREFIX = "image/";
const VIDEO_MIME_PREFIX = "video/";
const AUDIO_MIME_PREFIX = "audio/";
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg", "mov"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a"]);

function getUrlExtension(url: string): string | null {
  try {
    const parsed = new URL(url);
    const fileName = parsed.pathname.split("/").pop() || "";
    const dot = fileName.lastIndexOf(".");
    if (dot < 0 || dot >= fileName.length - 1) return null;
    return fileName.slice(dot + 1).toLowerCase();
  } catch {
    return null;
  }
}

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        const id = parsed.pathname.split("/")[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (parsed.pathname.startsWith("/embed/")) {
        const id = parsed.pathname.split("/")[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getEmbeddableMediaKind(url: string): "image" | "video" | "audio" | null {
  if (!isSafeHttpUrl(url)) return null;

  const youtubeEmbedUrl = getYouTubeEmbedUrl(url);
  if (youtubeEmbedUrl) return "video";

  const mimeType = guessMimeTypeFromUrl(url)?.toLowerCase();
  const ext = getUrlExtension(url);
  const isImage = Boolean(mimeType?.startsWith(IMAGE_MIME_PREFIX));
  const isVideo = Boolean(mimeType?.startsWith(VIDEO_MIME_PREFIX)) || Boolean(ext && VIDEO_EXTENSIONS.has(ext));
  const isAudio = Boolean(mimeType?.startsWith(AUDIO_MIME_PREFIX)) || Boolean(ext && AUDIO_EXTENSIONS.has(ext));

  if (isImage) return "image";
  if (isVideo) return "video";
  if (isAudio) return "audio";
  return null;
}

function isEmbeddableUrl(url: string): boolean {
  if (!isSafeHttpUrl(url)) return false;

  const youtubeEmbedUrl = getYouTubeEmbedUrl(url);
  if (youtubeEmbedUrl) return true;

  return getEmbeddableMediaKind(url) !== null;
}

function renderStandaloneEmbed(url: string, key: string, options?: LinkifyOptions): React.ReactNode | null {
  if (!isSafeHttpUrl(url)) return null;
  const caption = options?.getStandaloneMediaCaption?.(url) || "";

  const youtubeEmbedUrl = getYouTubeEmbedUrl(url);
  if (youtubeEmbedUrl) {
    return (
      <div key={key} className="max-w-xl overflow-hidden rounded-md border border-border/60 bg-muted/20 group">
        <iframe
          src={youtubeEmbedUrl}
          title={i18n.t("linkify.embeddedVideo")}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="aspect-video w-full"
        />
        {caption ? (
          <div className="px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            <p className="truncate" title={caption}>{caption}</p>
          </div>
        ) : null}
      </div>
    );
  }

  const mediaKind = getEmbeddableMediaKind(url);

  if (mediaKind === "image") {
    const handlePreviewClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      options?.onStandaloneMediaClick?.(url);
    };
    return (
      <button
        key={key}
        type="button"
        onClick={handlePreviewClick}
        className="group relative block max-w-sm"
      >
        <img
          src={url}
          alt={caption || i18n.t("linkify.embeddedAttachment")}
          loading="lazy"
          className="max-h-64 w-auto rounded-md border border-border/60 bg-muted/30 object-contain"
        />
        {caption ? (
          <div className="pointer-events-none absolute inset-x-1 bottom-1 rounded bg-background/85 px-2 py-1 text-left text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100">
            <p className="truncate" title={caption}>{caption}</p>
          </div>
        ) : null}
      </button>
    );
  }

  if (mediaKind === "video") {
    return (
      <div key={key} className="group relative max-w-xl">
        <video
          controls
          preload="metadata"
          onClick={(event) => {
            event.stopPropagation();
            options?.onStandaloneMediaClick?.(url);
          }}
          className="max-h-72 w-full rounded-md border border-border/60 bg-muted/30"
        >
          <source src={url} type={guessMimeTypeFromUrl(url) || undefined} />
        </video>
        {caption ? (
          <div className="pointer-events-none absolute inset-x-1 bottom-1 rounded bg-background/85 px-2 py-1 text-left text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100">
            <p className="truncate" title={caption}>{caption}</p>
          </div>
        ) : null}
      </div>
    );
  }

  if (mediaKind === "audio") {
    return (
      <div key={key} className="w-full max-w-xl">
        <audio
          controls
          preload="metadata"
          onClick={(event) => {
            event.stopPropagation();
          }}
          className="w-full"
        >
          <source src={url} type={guessMimeTypeFromUrl(url) || undefined} />
        </audio>
        {caption ? (
          <p className="mt-1 truncate text-xs text-muted-foreground" title={caption}>
            {caption}
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}

function isStandaloneUrlLine(value: string): string | null {
  const line = value.trim();
  if (!line) return null;
  const matches = linkify.match(line) || [];
  if (matches.length !== 1) return null;
  const match = matches[0];
  if (match.index !== 0 || match.lastIndex !== line.length || !match.url) return null;
  return match.url;
}

function getStandaloneEmbeddableUrlForLine(value: string): string | null {
  const standaloneUrl = isStandaloneUrlLine(value);
  if (!standaloneUrl) return null;
  return isEmbeddableUrl(standaloneUrl) ? standaloneUrl : null;
}

export function getStandaloneEmbeddableUrls(content: string): string[] {
  const urls = new Set<string>();
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const url = getStandaloneEmbeddableUrlForLine(line);
    if (url) {
      urls.add(url);
    }
  }
  return [...urls];
}

function preprocessMarkdownTokens(value: string): string {
  const nodes: string[] = [];
  let tokenCursor = 0;
  LINKIFY_CONTENT_TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINKIFY_CONTENT_TOKEN_REGEX.exec(value)) !== null) {
    const matchIndex = match.index;
    const prefix = match[1] ?? "";
    const token = match[2] ?? "";
    const hashtag = match[3];
    const mention = match[4];
    const nostrNpub = match[5];
    const tokenStart = matchIndex + prefix.length;

    if (tokenStart > tokenCursor) {
      nodes.push(value.slice(tokenCursor, tokenStart));
    }

    if (token.startsWith("#") && hashtag) {
      nodes.push(`[#${hashtag}](${HASH_LINK_PREFIX}${encodeURIComponent(hashtag)})`);
    } else if (token.startsWith("@") && mention) {
      const mentionIdentifier = normalizeMentionIdentifier(mention);
      nodes.push(`[@${mentionIdentifier}](${MENTION_LINK_PREFIX}${encodeURIComponent(mentionIdentifier)})`);
    } else if (token.toLowerCase().startsWith("nostr:") && nostrNpub) {
      const mentionIdentifier = normalizeMentionIdentifier(nostrNpub);
      nodes.push(`[@${mentionIdentifier}](${MENTION_LINK_PREFIX}${encodeURIComponent(mentionIdentifier)})`);
    } else {
      nodes.push(value.slice(tokenStart, tokenStart + token.length));
    }

    tokenCursor = tokenStart + token.length;
  }

  if (tokenCursor < value.length) {
    nodes.push(value.slice(tokenCursor));
  }

  return nodes.length > 0 ? nodes.join("") : value;
}

function renderMarkdownBlock(
  value: string,
  baseKey: string,
  onHashtagClick?: (tag: string) => void,
  options?: LinkifyOptions
): React.ReactNode {
  const MarkdownAnchor = ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    if (href?.startsWith(HASH_LINK_PREFIX)) {
      const hashtag = decodeURIComponent(href.slice(HASH_LINK_PREFIX.length));
      return (
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onHashtagClick?.(hashtag);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            onHashtagClick?.(hashtag);
          }}
          className={options?.plainHashtags ? "inline whitespace-normal break-all align-baseline" : INLINE_TOKEN_CLASS}
          data-onboarding="content-hashtag"
          aria-label={`Filter by #${hashtag}`}
          title={`Filter to #${hashtag}`}
        >
          #{hashtag}
        </span>
      );
    }

    if (href?.startsWith(MENTION_LINK_PREFIX)) {
      const mentionIdentifier = decodeURIComponent(href.slice(MENTION_LINK_PREFIX.length));
      const resolvedPerson = resolveMentionPerson(mentionIdentifier, options?.people);
      const fallbackPerson = buildFallbackMentionPerson(mentionIdentifier);
      const clickablePerson = resolvedPerson || fallbackPerson;
      const mentionLabel = resolvedPerson?.name
        || resolvedPerson?.displayName
        || (fallbackPerson ? formatPubkeyMention(fallbackPerson.id) : formatPubkeyMention(mentionIdentifier));
      const userFacingMentionIdentifier = toUserFacingPubkey(mentionIdentifier);

      if (clickablePerson) {
        return (
          <PersonHoverCard person={clickablePerson}>
            <PersonActionMenu person={clickablePerson} enableModifierShortcuts>
              <span
                role="button"
                tabIndex={0}
                className={`${INLINE_TOKEN_CLASS} text-left`}
                aria-label={`Person actions for ${mentionLabel}`}
              >
                @{mentionLabel}
              </span>
            </PersonActionMenu>
          </PersonHoverCard>
        );
      }

      return (
        <span
          className={`${TASK_INTERACTION_STYLES.inlineLink} inline whitespace-normal break-all align-baseline`}
          title={`@${userFacingMentionIdentifier}`}
        >
          @{mentionLabel}
        </span>
      );
    }

    if (!href) {
      return <>{children}</>;
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className={`${TASK_INTERACTION_STYLES.inlineLink} inline whitespace-normal break-all align-baseline`}
      >
        {children}
      </a>
    );
  };

  const MarkdownCode = ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-muted/60 px-1 py-0.5 text-[0.92em] font-mono">
      {children}
    </code>
  );

  const MarkdownParagraph = ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1 break-words last:mb-0">
      {children}
    </p>
  );

  const MarkdownList = ({
    ordered,
    children,
  }: {
    ordered?: boolean;
    children?: React.ReactNode;
  }) => {
    const className = "mb-1 break-words space-y-0.5 pl-5 last:mb-0";
    if (ordered) {
      return <ol className={`${className} list-decimal`}>{children}</ol>;
    }
    return <ul className={`${className} list-disc`}>{children}</ul>;
  };

  const MarkdownListItem = ({ children }: { children?: React.ReactNode }) => (
    <li className="break-words [&>p]:mb-0">
      {children}
    </li>
  );

  const MarkdownHeading = ({
    level,
    children,
  }: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
    children?: React.ReactNode;
  }) => {
    const headingClassName = level === 1
      ? "text-base font-semibold tracking-tight"
      : level === 2
        ? "text-[0.95rem] font-semibold tracking-tight"
        : "text-sm font-medium";
    return (
      <span className={`${headingClassName} mb-1 block break-words last:mb-0`}>
        {children}
      </span>
    );
  };

  return (
    <div className="whitespace-normal" key={baseKey}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          p: MarkdownParagraph,
          ul: ({ children }) => <MarkdownList>{children}</MarkdownList>,
          ol: ({ children }) => <MarkdownList ordered>{children}</MarkdownList>,
          li: MarkdownListItem,
          a: MarkdownAnchor,
          code: MarkdownCode,
          h1: ({ children }) => <MarkdownHeading level={1}>{children}</MarkdownHeading>,
          h2: ({ children }) => <MarkdownHeading level={2}>{children}</MarkdownHeading>,
          h3: ({ children }) => <MarkdownHeading level={3}>{children}</MarkdownHeading>,
          h4: ({ children }) => <MarkdownHeading level={4}>{children}</MarkdownHeading>,
          h5: ({ children }) => <MarkdownHeading level={5}>{children}</MarkdownHeading>,
          h6: ({ children }) => <MarkdownHeading level={6}>{children}</MarkdownHeading>,
        }}
      >
        {preprocessMarkdownTokens(value)}
      </ReactMarkdown>
    </div>
  );
}

export function linkifyContent(
  content: string,
  onHashtagClick?: (tag: string) => void,
  options?: LinkifyOptions
): React.ReactNode[] {
  const lines = content.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  const pendingMarkdownLines: string[] = [];
  const standaloneEmbedsByLine: Array<string | null> = options?.disableStandaloneEmbeds
    ? lines.map((): null => null)
    : lines.map((line): string | null => getStandaloneEmbeddableUrlForLine(line));

  const flushMarkdownBlock = (blockIndex: number) => {
    if (pendingMarkdownLines.length === 0) return;
    nodes.push(
      renderMarkdownBlock(
        pendingMarkdownLines.join("\n"),
        `block-${blockIndex}`,
        onHashtagClick,
        options
      )
    );
    pendingMarkdownLines.length = 0;
  };

  let markdownBlockIndex = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const standaloneUrl = standaloneEmbedsByLine[index];
    if (standaloneUrl) {
      flushMarkdownBlock(markdownBlockIndex);
      markdownBlockIndex += 1;
      const embedNode = renderStandaloneEmbed(standaloneUrl, `embed-${index}`, options);
      if (embedNode) {
        nodes.push(embedNode);
        continue;
      }
    }

    pendingMarkdownLines.push(line);
  }

  flushMarkdownBlock(markdownBlockIndex);

  return nodes;
}
