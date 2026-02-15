import { useState, useCallback, useRef, useEffect } from "react";
import { MobileNav, MobileViewType } from "./MobileNav";
import { MobileFilters } from "./MobileFilters";
import { UnifiedBottomBar } from "./UnifiedBottomBar";
import { SwipeIndicator } from "./SwipeIndicator";
import { TaskTree } from "@/components/tasks/TaskTree";
import { FeedView } from "@/components/tasks/FeedView";
import { CalendarView } from "@/components/tasks/CalendarView";
import { FocusedTaskBreadcrumb } from "@/components/tasks/FocusedTaskBreadcrumb";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useSwipeNavigation } from "@/hooks/use-swipe-navigation";
import { Relay, Channel, Person, Task } from "@/types";
import { cn } from "@/lib/utils";
import { useNDK } from "@/lib/nostr/ndk-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface MobileLayoutProps {
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  tasks: Task[];
  allTasks: Task[];
  searchQuery: string;
  focusedTaskId: string | null;
  currentUser?: Person;
  isSignedIn: boolean;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  onSearchChange: (query: string) => void;
  onNewTask: (content: string, tags: string[], relays: string[], taskType: string, dueDate?: Date, dueTime?: string, parentId?: string, initialStatus?: "todo" | "in-progress" | "done") => void;
  onToggleComplete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: "todo" | "in-progress" | "done") => void;
  onFocusTask: (taskId: string | null) => void;
  onRelayToggle: (id: string) => void;
  onChannelToggle: (id: string) => void;
  onPersonToggle: (id: string) => void;
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
  onSignInClick: () => void;
  onGuideClick: () => void;
  onHashtagClick: (tag: string) => void;
  forceComposeMode?: boolean;
  onAuthorClick?: (author: Person) => void;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
}

// Mobile view order for swipe navigation
const mobileViews: MobileViewType[] = ["tree", "feed", "list", "calendar"];

const isPrimaryMobileView = (view: ViewType): view is "tree" | "feed" | "list" | "calendar" => {
  return view === "tree" || view === "feed" || view === "list" || view === "calendar";
};

export function MobileLayout({
  relays,
  channels,
  people,
  tasks,
  allTasks,
  searchQuery,
  focusedTaskId,
  currentUser,
  isSignedIn,
  currentView,
  onViewChange,
  onSearchChange,
  onNewTask,
  onToggleComplete,
  onStatusChange,
  onFocusTask,
  onRelayToggle,
  onChannelToggle,
  onPersonToggle,
  onAddRelay,
  onRemoveRelay,
  onSignInClick,
  onGuideClick,
  onHashtagClick,
  forceComposeMode = false,
  onAuthorClick,
  mentionRequest = null,
}: MobileLayoutProps) {
  const { user, needsProfileSetup, updateUserProfile } = useNDK();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(new Date());
  const [mobileView, setMobileView] = useState<MobileViewType>(
    isPrimaryMobileView(currentView) ? currentView : "tree"
  );
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [profileNip05, setProfileNip05] = useState("");
  const [profileAbout, setProfileAbout] = useState("");

  // Build default content from active channel filters
  const includedChannels = channels.filter(c => c.filterState === "included");
  const defaultContent = includedChannels.map(c => `#${c.name}`).join(" ");

  const handleMobileViewChange = useCallback((view: MobileViewType) => {
    if (view === "filters") {
      setShowFilters(true);
      setMobileView("filters");
      return;
    }

    setShowFilters(false);
    setMobileView(view);
    onViewChange(view);
  }, [onViewChange]);

  const openProfileEditor = useCallback(() => {
    setProfileName(user?.profile?.name || "");
    setProfileDisplayName(user?.profile?.displayName || "");
    setProfilePicture(user?.profile?.picture || "");
    setProfileNip05(user?.profile?.nip05 || "");
    setProfileAbout(user?.profile?.about || "");
    setIsProfileEditorOpen(true);
  }, [user?.profile?.about, user?.profile?.displayName, user?.profile?.name, user?.profile?.nip05, user?.profile?.picture]);

  const handleSaveProfile = useCallback(async () => {
    if (!profileName.trim()) {
      toast.error("Profile name is required");
      return;
    }
    setIsSavingProfile(true);
    try {
      const success = await updateUserProfile({
        name: profileName,
        displayName: profileDisplayName || undefined,
        picture: profilePicture || undefined,
        nip05: profileNip05 || undefined,
        about: profileAbout || undefined,
      });
      if (success) {
        toast.success("Profile updated on connected relays");
        setIsProfileEditorOpen(false);
      } else {
        toast.error("Failed to update profile. Check relay connectivity and try again.");
      }
    } finally {
      setIsSavingProfile(false);
    }
  }, [profileAbout, profileDisplayName, profileName, profileNip05, profilePicture, updateUserProfile]);

  // Swipe navigation handlers
  const handleSwipeLeft = useCallback(() => {
    if (showFilters) {
      setShowFilters(false);
      return;
    }
    const currentIndex = mobileViews.indexOf(mobileView);
    if (currentIndex < mobileViews.length - 1) {
      const nextView = mobileViews[currentIndex + 1];
      handleMobileViewChange(nextView);
    }
  }, [mobileView, showFilters, handleMobileViewChange]);

  const handleSwipeRight = useCallback(() => {
    const currentIndex = mobileViews.indexOf(mobileView);
    if (currentIndex > 0) {
      const prevView = mobileViews[currentIndex - 1];
      handleMobileViewChange(prevView);
    } else if (currentIndex === 0) {
      setShowFilters(true);
    }
  }, [mobileView, handleMobileViewChange]);

  // Swipe animation state
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const animatedSwipeLeft = useCallback(() => {
    setSwipeDirection("left");
    setIsAnimating(true);
    setTimeout(() => {
      handleSwipeLeft();
      setIsAnimating(false);
      setSwipeDirection(null);
    }, 150);
  }, [handleSwipeLeft]);

  const animatedSwipeRight = useCallback(() => {
    setSwipeDirection("right");
    setIsAnimating(true);
    setTimeout(() => {
      handleSwipeRight();
      setIsAnimating(false);
      setSwipeDirection(null);
    }, 150);
  }, [handleSwipeRight]);

  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: animatedSwipeLeft,
    onSwipeRight: animatedSwipeRight,
    threshold: 60,
    enableHaptics: true,
  });

  const viewProps = {
    tasks,
    allTasks,
    relays,
    channels,
    people,
    currentUser,
    searchQuery,
    onSearchChange,
    onNewTask,
    onToggleComplete,
    focusedTaskId,
    onFocusTask,
    onStatusChange,
    onHashtagClick,
    onAuthorClick,
    mentionRequest,
  };

  const mobileCurrentView: MobileViewType = showFilters ? "filters" : mobileView;

  useEffect(() => {
    if (showFilters) return;
    setMobileView(isPrimaryMobileView(currentView) ? currentView : "tree");
  }, [currentView, showFilters]);

  useEffect(() => {
    if (user && needsProfileSetup && !isProfileEditorOpen) {
      openProfileEditor();
    }
  }, [isProfileEditorOpen, needsProfileSetup, openProfileEditor, user]);

  const renderView = () => {
    if (showFilters) {
      return (
        <MobileFilters
          relays={relays}
          channels={channels}
          people={people}
          onRelayToggle={onRelayToggle}
          onChannelToggle={onChannelToggle}
          onPersonToggle={onPersonToggle}
          onAddRelay={onAddRelay}
          onRemoveRelay={onRemoveRelay}
          onSignInClick={onSignInClick}
          onGuideClick={onGuideClick}
          onEditProfileClick={openProfileEditor}
        />
      );
    }
    switch (currentView) {
      case "tree":
        return <TaskTree {...viewProps} isMobile />;
      case "feed":
        return <FeedView {...viewProps} isMobile />;
      case "list":
        return <CalendarView {...viewProps} isMobile mobileView="upcoming" selectedDate={selectedCalendarDate} onSelectedDateChange={setSelectedCalendarDate} />;
      case "calendar":
        return <CalendarView {...viewProps} isMobile mobileView="calendar" selectedDate={selectedCalendarDate} onSelectedDateChange={setSelectedCalendarDate} />;
      default:
        return <TaskTree {...viewProps} isMobile />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <MobileNav currentView={mobileCurrentView} onViewChange={handleMobileViewChange} />
      
      {/* Swipe indicator */}
      <SwipeIndicator 
        views={mobileViews} 
        currentView={mobileCurrentView} 
        showFilters={showFilters} 
      />
      
      <main 
        className="flex-1 overflow-hidden relative"
        {...swipeHandlers}
      >
        <div className="h-full flex flex-col">
          {!showFilters && focusedTaskId && currentView !== "list" && currentView !== "calendar" && (
            <FocusedTaskBreadcrumb
              allTasks={allTasks}
              focusedTaskId={focusedTaskId}
              onFocusTask={onFocusTask}
              className="h-10 px-3 text-xs"
            />
          )}
          <div 
            className={cn(
              "flex-1 min-h-0 w-full transition-transform duration-150 ease-out",
              isAnimating && swipeDirection === "left" && "-translate-x-4 opacity-80",
              isAnimating && swipeDirection === "right" && "translate-x-4 opacity-80"
            )}
          >
            {renderView()}
          </div>
        </div>
      </main>
      
      <UnifiedBottomBar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onSubmit={onNewTask}
        currentView={currentView}
        focusedTaskId={focusedTaskId}
        selectedCalendarDate={currentView === "calendar" ? selectedCalendarDate : null}
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={onRelayToggle}
        onChannelToggle={onChannelToggle}
        onPersonToggle={onPersonToggle}
        defaultContent={defaultContent}
        isSignedIn={isSignedIn}
        onSignInClick={onSignInClick}
        forceComposeMode={forceComposeMode}
      />

      <Dialog
        open={isProfileEditorOpen}
        onOpenChange={(open) => {
          if (!open && needsProfileSetup) return;
          setIsProfileEditorOpen(open);
        }}
      >
        <DialogContent className="w-[calc(100%-1rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle>{needsProfileSetup ? "Set up your profile" : "Edit profile"}</DialogTitle>
            <DialogDescription>
              Your Nostr metadata (`kind:0`) will be published to connected relays. Name is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mobile-profile-name">Name *</Label>
              <Input id="mobile-profile-name" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mobile-profile-display-name">Display name</Label>
              <Input id="mobile-profile-display-name" value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mobile-profile-picture">Picture URL</Label>
              <Input id="mobile-profile-picture" value={profilePicture} onChange={(e) => setProfilePicture(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mobile-profile-nip05">NIP-05</Label>
              <Input id="mobile-profile-nip05" value={profileNip05} onChange={(e) => setProfileNip05(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mobile-profile-about">About</Label>
              <Textarea id="mobile-profile-about" value={profileAbout} onChange={(e) => setProfileAbout(e.target.value)} rows={4} />
            </div>
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2 bg-background/95 pt-2">
            {!needsProfileSetup && (
              <Button variant="outline" onClick={() => setIsProfileEditorOpen(false)} disabled={isSavingProfile}>
                Cancel
              </Button>
            )}
            <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
              {isSavingProfile ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
