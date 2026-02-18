import { TrendingUp, Hash } from "lucide-react";
import { useTranslation } from "react-i18next";

const trendingTags = [
  { tag: "nostr", posts: 2847 },
  { tag: "decentralized", posts: 1523 },
  { tag: "web3", posts: 984 },
  { tag: "privacy", posts: 756 },
  { tag: "opensource", posts: 621 },
];

export function TrendingWidget() {
  const { t } = useTranslation();
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="font-heading font-semibold text-foreground">{t("widgets.trending.title")}</h3>
        </div>
      </div>
      <div className="divide-y divide-border">
        {trendingTags.map(({ tag, posts }, index) => (
          <button
            key={tag}
            className="w-full p-3 hover:bg-muted/30 transition-colors text-left group"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-4">{index + 1}</span>
              <Hash className="w-4 h-4 text-primary" />
              <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                {tag}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              {t("widgets.trending.posts", { count: posts.toLocaleString() })}
            </p>
          </button>
        ))}
      </div>
      <button className="w-full p-3 text-sm text-primary hover:bg-muted/30 transition-colors font-medium">
        {t("widgets.trending.showMore")}
      </button>
    </div>
  );
}
