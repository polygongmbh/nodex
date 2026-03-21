import { Sidebar } from "@/components/layout/Sidebar";
import { useFeedSidebarController } from "@/features/feed-page/controllers/feed-sidebar-controller-context";

export function FeedPageSidebar() {
  const sidebarState = useFeedSidebarController();
  return <Sidebar {...sidebarState} />;
}
