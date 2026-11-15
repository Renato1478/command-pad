export type Collection = { id: string; name: string };
export type Folder = {
  id: string;
  collection_id: string;
  parent_id: string | null;
  name: string;
};
export type Command = {
  id: string;
  name: string;
  body: string;
  collection_id: string | null;
  folder_id: string | null;
  favorite: boolean;
};
export type Data = {
  collections: Collection[];
  folders: Folder[];
  commands: Command[];
};
