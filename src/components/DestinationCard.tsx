import { ArrowUpRight, Heart, Leaf, MapPin, Users } from "lucide-react";
import type { Destination } from "../lib/data";
export default function DestinationCard({
  place,
  saved,
  onSave,
  onOpen,
}: {
  place: Destination;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="destination-card">
      <div className="destination-image-wrap">
        <button
          className="destination-image-button"
          onClick={onOpen}
          aria-label={`Explore ${place.name}`}
        >
          <img
            src={place.image}
            alt={`${place.name}, ${place.country}`}
            loading="lazy"
          />
        </button>
        <span className="place-tag">
          <Leaf size={12} />
          {place.tags[0] || place.category}
        </span>
        <button
          className={`save-button ${saved ? "is-saved" : ""}`}
          aria-label={`${saved ? "Unsave" : "Save"} ${place.name}`}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Heart size={17} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <button className="destination-content" onClick={onOpen}>
        <span className="place-location">
          <MapPin size={12} />
          {place.country}
        </span>
        <span className="destination-title">
          {place.name}
          <ArrowUpRight size={19} />
        </span>
        <span className="destination-description">{place.description}</span>
        <span className="card-bottom">
          <span className={`crowd crowd-${place.crowd.toLowerCase()}`}>
            <span />
            {place.crowd} crowds <small>· sample</small>
          </span>
          <span className="place-fit">
            <Users size={12} />
            {place.duration}
          </span>
        </span>
      </button>
    </article>
  );
}
