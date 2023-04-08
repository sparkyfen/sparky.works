export interface Venue {
  id: number;
  displayName: string;
  uri: string;
  metroArea: {
    id: number;
    displayName: string;
    uri: string;
  };
}

export interface Performance {
  artist: {
    id: number;
    displayName: string;
    uri: string;
  };
  billing: string;
  displayName: string;
  id: number;
  billingIndex: number;
  artistBillingIndex: number;
  displayArtist: string;
  displayBilling: string;
  displayPrice?: string;
  type: string;
  datetime: string;
}

export interface Event {
  id: number;
  displayName: string;
  type: string;
  uri: string;
  status: string;
  popularity: number;
  start: {
    date: string;
    datetime: string;
    time: string;
  };
  performance: Performance[];
  venue: Venue;
}
