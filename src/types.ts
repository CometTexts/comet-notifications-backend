interface RecordModel {
  collectionId: string;
  collectionName: string;
  id: string;
  created: string;
  updated: string;
}

export enum Collections {
  Users = "users",
  Groups = "groups",
  Messages = "messages",
  PushTokens = "pushTokens",
}

export interface User extends RecordModel {
  username: string;
  email: string;
  emailVisibility: boolean;
  verified: boolean;
  name: string;
  avatar?: string;
  joinedGroups: string[];
}

export interface Group extends RecordModel {
  name: string;
  joinCode: string;
  owner: string;
  allowedPosters: string[];
  icon?: string;
}

export interface Message extends RecordModel {
  group: string;
  from: string;
  text: string;
}

export interface PushToken extends RecordModel {
  pushToken: string;
  user: string;
}

export type WithExpand<T = any, E = any> = T & { expand: E };
