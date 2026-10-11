# MySpace backend repair summary

This package removes Hotelbeds from the active platform search path and limits active supplier orchestration to WebBeds, RateHawk and HyperGuest.

Key repairs:
- platform v2 supplier scope no longer advertises Hotelbeds;
- active supplier adapters contain only WebBeds, RateHawk and HyperGuest;
- harvested JSON rows are restricted to those active suppliers and Hotelbeds-tagged rows are rejected;
- WebBeds live parsing no longer assigns Abu Dhabi/UAE to every hotel;
- RateHawk status recognises RATEHAWK_KEY_TOKEN;
- HyperGuest status recognises HYPERGUEST_AUTH_TOKEN;
- content enrichment is wired into the platform response;
- local licensed content can be added to data/hotel-content.json;
- relative image paths are no longer incorrectly converted to Hotelbeds URLs;
- package.json has been restored.

Important limitation: a live availability response does not necessarily contain property names or images. Real names and images can only appear when the contracted supplier returns them or when genuine licensed content is added to data/hotel-content.json or a configured supplier content endpoint.
