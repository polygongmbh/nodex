import React from "react";
import LinkifyIt from "linkify-it";
import { TASK_INTERACTION_STYLES } from "@/lib/task-interaction-styles";
import type { Person } from "@/types";
import { getMentionAliases, normalizeMentionIdentifier } from "@/lib/mentions";
import { guessMimeTypeFromUrl, isSafeHttpUrl } from "@/lib/attachments";

const TOKEN_REGEX =
  /(^|[^A-Za-z0-9_])(#([A-Za-z0-9_]+)|@([A-Za-z0-9._-]+(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?))/g;
const MARKDOWN_INLINE_REGEX = /(\[[^\]]+\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*)/g;
const linkify = new LinkifyIt();

function formatPubkeyMention(pubkey: string): string {
  return pubkey.length === 64 ? `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}` : pubkey;
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

interface LinkifyOptions {
  plainHashtags?: boolean;
  people?: Person[];
  onMentionClick?: (person: Person) => void;
  onStandaloneMediaClick?: (url: string) => void;
  getStandaloneMediaCaption?: (url: string) => string | undefined;
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
          title="Embedded video"
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
          alt={caption || "Embedded attachment"}
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
            options?.onStandaloneMediaClick?.(url);
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

function renderTokenizedText(
  value: string,
  baseKey: string,
  onHashtagClick?: (tag: string) => void,
  options?: LinkifyOptions
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let tokenCursor = 0;
  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_REGEX.exec(value)) !== null) {
    const matchIndex = match.index;
    const prefix = match[1] ?? "";
    const token = match[2] ?? "";
    const hashtag = match[3];
    const mention = match[4];
    const tokenStart = matchIndex + prefix.length;

    if (tokenStart > tokenCursor) {
      nodes.push(value.slice(tokenCursor, tokenStart));
    }

    if (token.startsWith("#") && hashtag) {
      nodes.push(
        <button
          key={`${baseKey}-tag-${tokenStart}-${token}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onHashtagClick?.(hashtag);
          }}
          className={options?.plainHashtags ? "" : TASK_INTERACTION_STYLES.inlineLink}
          data-onboarding="content-hashtag"
          aria-label={`Filter by #${hashtag}`}
          title={`Filter to #${hashtag}`}
        >
          #{hashtag}
        </button>
      );
    } else if (token.startsWith("@") && mention) {
      const mentionIdentifier = normalizeMentionIdentifier(mention);
      const resolvedPerson = resolveMentionPerson(mentionIdentifier, options?.people);
      const mentionLabel = resolvedPerson?.name
        || resolvedPerson?.displayName
        || formatPubkeyMention(mentionIdentifier);

      if (resolvedPerson && options?.onMentionClick) {
        nodes.push(
          <button
            key={`${baseKey}-mention-${tokenStart}-${token}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              options.onMentionClick?.(resolvedPerson);
            }}
            className={TASK_INTERACTION_STYLES.inlineLink}
            aria-label={`Open user ${mentionLabel}`}
            title={token}
          >
            @{mentionLabel}
          </button>
        );
      } else {
        nodes.push(
          <span
            key={`${baseKey}-mention-${tokenStart}-${token}`}
            className={TASK_INTERACTION_STYLES.inlineLink}
            title={token}
          >
            @{mentionLabel}
          </span>
        );
      }
    } else {
      nodes.push(value.slice(tokenStart, tokenStart + token.length));
    }

    tokenCursor = tokenStart + token.length;
  }

  if (tokenCursor < value.length) {
    nodes.push(value.slice(tokenCursor));
  }

  return nodes.length > 0 ? nodes : [value];
}

function renderAutoLinkedText(
  value: string,
  baseKey: string,
  onHashtagClick?: (tag: string) => void,
  options?: LinkifyOptions
): React.ReactNode[] {
  const matches = linkify.match(value) || [];
  if (matches.length === 0) {
    return renderTokenizedText(value, `${baseKey}-plain`, onHashtagClick, options);
  }

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of matches) {
    if (match.index > lastIndex) {
      nodes.push(
        ...renderTokenizedText(
          value.slice(lastIndex, match.index),
          `${baseKey}-text-${lastIndex}`,
          onHashtagClick,
          options
        )
      );
    }

    nodes.push(
      <a
        key={`${baseKey}-url-${match.index}`}
        href={match.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className={`${TASK_INTERACTION_STYLES.inlineLink} break-all`}
      >
        {match.text}
      </a>
    );
    lastIndex = match.lastIndex;
  }

  if (lastIndex < value.length) {
    nodes.push(
      ...renderTokenizedText(
        value.slice(lastIndex),
        `${baseKey}-tail-${lastIndex}`,
        onHashtagClick,
        options
      )
    );
  }

  return nodes;
}

function renderMarkdownLine(
  value: string,
  baseKey: string,
  onHashtagClick?: (tag: string) => void,
  options?: LinkifyOptions
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  MARKDOWN_INLINE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MARKDOWN_INLINE_REGEX.exec(value)) !== null) {
    if (match.index > cursor) {
      nodes.push(
        ...renderAutoLinkedText(
          value.slice(cursor, match.index),
          `${baseKey}-seg-${cursor}`,
          onHashtagClick,
          options
        )
      );
    }

    const full = match[0] || "";
    const markdownUrl = match[2];
    const boldText = match[3];
    const codeText = match[4];
    const italicText = match[5];

    if (full.startsWith("[") && markdownUrl) {
      const labelEnd = full.indexOf("](");
      const label = labelEnd > 0 ? full.slice(1, labelEnd) : markdownUrl;
      nodes.push(
        <a
          key={`${baseKey}-md-link-${match.index}`}
          href={markdownUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={`${TASK_INTERACTION_STYLES.inlineLink} break-all`}
        >
          {label}
        </a>
      );
    } else if (typeof boldText === "string") {
      nodes.push(
        <strong key={`${baseKey}-md-bold-${match.index}`}>
          {renderAutoLinkedText(boldText, `${baseKey}-bold-${match.index}`, onHashtagClick, options)}
        </strong>
      );
    } else if (typeof codeText === "string") {
      nodes.push(
        <code
          key={`${baseKey}-md-code-${match.index}`}
          className="rounded bg-muted/60 px-1 py-0.5 text-[0.92em] font-mono"
        >
          {codeText}
        </code>
      );
    } else if (typeof italicText === "string") {
      nodes.push(
        <em key={`${baseKey}-md-italic-${match.index}`}>
          {renderAutoLinkedText(italicText, `${baseKey}-italic-${match.index}`, onHashtagClick, options)}
        </em>
      );
    } else {
      nodes.push(full);
    }

    cursor = match.index + full.length;
  }

  if (cursor < value.length) {
    nodes.push(
      ...renderAutoLinkedText(
        value.slice(cursor),
        `${baseKey}-tail-${cursor}`,
        onHashtagClick,
        options
      )
    );
  }

  return nodes;
}

export function linkifyContent(
  content: string,
  onHashtagClick?: (tag: string) => void,
  options?: LinkifyOptions
): React.ReactNode[] {
  const lines = content.split(/\r?\n/);
  const nodes: React.ReactNode[] = [];
  const standaloneEmbedsByLine = lines.map((line) => getStandaloneEmbeddableUrlForLine(line));

  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) {
      const prevIsEmbed = Boolean(standaloneEmbedsByLine[index - 1]);
      const currentIsEmbed = Boolean(standaloneEmbedsByLine[index]);
      if (!prevIsEmbed && !currentIsEmbed) {
        nodes.push(<br key={`line-break-${index}`} />);
      }
    }

    const line = lines[index];
    const standaloneUrl = standaloneEmbedsByLine[index];
    if (standaloneUrl) {
      const embedNode = renderStandaloneEmbed(standaloneUrl, `embed-${index}`, options);
      if (embedNode) {
        nodes.push(embedNode);
        continue;
      }
    }

    nodes.push(...renderMarkdownLine(line, `line-${index}`, onHashtagClick, options));
  }

  return nodes;
}
