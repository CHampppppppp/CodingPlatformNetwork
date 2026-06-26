import React, { useState } from "react";
import { Star } from "lucide-react";

export interface StarRatingProps {
  /** 当前分值 1-5，0 表示未评分 */
  value: number;
  /** 分值变化回调 */
  onChange?: (value: number) => void;
  /** 是否只读 */
  readOnly?: boolean;
  /** 星星尺寸 */
  size?: number;
  /** 标签文案 */
  label?: string;
}

const StarRating: React.FC<StarRatingProps> = ({
  value,
  onChange,
  readOnly = false,
  size = 16,
  label,
}) => {
  const [hoverValue, setHoverValue] = useState(0);

  const displayValue = hoverValue || value;

  return (
    <div className="flex items-center gap-2 z-10">
      {label && (
        <span className="text-[11px] text-slate-500 shrink-0">{label}</span>
      )}
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((score) => {
          const filled = score <= displayValue;
          return (
            <button
              key={score}
              type="button"
              disabled={readOnly}
              onClick={(e) => {
                e.stopPropagation();
                onChange?.(score);
              }}
              onMouseEnter={() => !readOnly && setHoverValue(score)}
              onMouseLeave={() => !readOnly && setHoverValue(0)}
              className={`p-0.5 transition-colors focus:outline-none ${readOnly ? "cursor-default" : "cursor-pointer hover:scale-105"
                }`}
              aria-label={`评分 ${score} 分`}
            >
              <Star
                size={size}
                className={
                  filled
                    ? "fill-amber-400 text-amber-400"
                    : "fill-transparent text-slate-200"
                }
              />
            </button>
          );
        })}
      </div>
      {displayValue > 0 && (
        <span className="text-[11px] font-medium text-amber-600 min-w-[1.5rem]">
          {displayValue.toFixed(0)}
        </span>
      )}
    </div>
  );
};

export default StarRating;
