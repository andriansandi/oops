export interface D1Credentials {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

export interface NeonCredentials {
  connectionString: string;
}

export interface D1InstanceRecord {
  id: string;
  name: string;
  type: "d1";
  credentials: D1Credentials;
  createdAt: string;
}

export interface NeonInstanceRecord {
  id: string;
  name: string;
  type: "neon";
  credentials: NeonCredentials;
  createdAt: string;
}

export type InstanceRecord = D1InstanceRecord | NeonInstanceRecord;
