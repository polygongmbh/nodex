import { createContext, useContext, type PropsWithChildren } from "react";

export interface FeedSidebarCommands {
  pinChannel(channelId: string): void;
  unpinChannel(channelId: string): void;
  pinPerson(personId: string): void;
  unpinPerson(personId: string): void;
}

const defaultCommands: FeedSidebarCommands = {
  pinChannel: () => {},
  unpinChannel: () => {},
  pinPerson: () => {},
  unpinPerson: () => {},
};

const FeedSidebarCommandsContext = createContext<FeedSidebarCommands>(defaultCommands);

interface FeedSidebarCommandsProviderProps extends PropsWithChildren {
  value: FeedSidebarCommands;
}

export function FeedSidebarCommandsProvider({ value, children }: FeedSidebarCommandsProviderProps) {
  return (
    <FeedSidebarCommandsContext.Provider value={value}>
      {children}
    </FeedSidebarCommandsContext.Provider>
  );
}

export function useFeedSidebarCommands(): FeedSidebarCommands {
  return useContext(FeedSidebarCommandsContext);
}
