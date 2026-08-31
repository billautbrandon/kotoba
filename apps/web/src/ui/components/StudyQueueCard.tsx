import { useNavigate } from "react-router-dom";

import type { WordWithStats } from "../../api";
import { formatWordJp } from "../utils/wordDisplay";

type QueueRow = {
  label: string;
  count: number;
  words: WordWithStats[];
};

type StudyQueueCardProps = {
  weakest: QueueRow;
  dueToday: QueueRow;
  newWords: QueueRow;
};

export function StudyQueueCard({ weakest, dueToday, newWords }: StudyQueueCardProps) {
  const navigate = useNavigate();
  const rows = [weakest, dueToday, newWords];
  const canPractice = dueToday.count > 0 || weakest.count > 0;

  function handlePractice() {
    if (dueToday.count > 0) {
      navigate("/train/srs/due");
      return;
    }
    navigate("/train/difficult");
  }

  return (
    <div className="dashCard">
      <h2 className="dashCard__title">À venir</h2>
      <div className="queueList">
        {rows.map((row) => (
          <div key={row.label} className="queueRow">
            <div className="queueRow__count">{row.count}</div>
            <div className="queueRow__copy">
              <div className="queueRow__label">{row.label}</div>
            </div>
            <div className="queueRow__previews">
              {row.words.slice(0, 3).map((word) => (
                <span key={word.id} className="queueChip">
                  {formatWordJp(word)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        className="button button--primary queueCta"
        type="button"
        onClick={handlePractice}
        disabled={!canPractice}
      >
        Pratiquer maintenant
      </button>
    </div>
  );
}
