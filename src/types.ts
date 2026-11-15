export type Collection = { id: string; name: string };
export type Command = {
  id: string;
  name: string;
  body: string;
  collection_id: string | null;
  favorite: boolean;
};
export type Data = { collections: Collection[]; commands: Command[] };
