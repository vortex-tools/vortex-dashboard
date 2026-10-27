import FeatherIcon from 'feather-icons-react';
import { ReactNode, useId, useRef, useState } from 'react';
import { Overlay, Popover } from 'react-bootstrap';

/**
 * An info icon that explains something: the note opens at once on hover
 * or keyboard focus, and on tap (touch has no hover); moving away, Escape
 * or tapping elsewhere closes it. Use it instead of a `title` attribute,
 * which shows only after a delay and never on touch.
 */
const InfoTip = ({
  children,
  size = 13,
  className = 'ms-2'
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) => {
  const id = useId();
  const target = useRef<HTMLButtonElement>(null);
  const [show, setShow] = useState(false);
  // A click always opens (never toggles shut), so a tap's emulated hover
  // and its click don't cancel out.
  return (
    <>
      <button
        ref={target}
        type="button"
        className={`info-tip-button d-inline-flex align-items-center p-0 border-0 bg-transparent text-body-quaternary ${className}`}
        aria-label="More information"
        aria-describedby={show ? id : undefined}
        // Hover means a mouse: a tap's emulated enter / leave would close
        // what the tap opened. Touch opens on click, closes on a tap
        // elsewhere.
        onPointerEnter={e => {
          if (e.pointerType === 'mouse') setShow(true);
        }}
        onPointerLeave={e => {
          if (e.pointerType === 'mouse') setShow(false);
        }}
        onFocus={() => setShow(true)}
        onBlur={e => {
          // Focus leaving for the popover itself keeps it open.
          if (!e.relatedTarget?.closest?.('.info-tip')) setShow(false);
        }}
        onClick={e => {
          e.stopPropagation();
          setShow(true);
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') setShow(false);
        }}
      >
        <FeatherIcon icon={info} size={size} />
      </button>
      <Overlay
        target={target.current}
        show={show}
        placement="bottom"
        rootClose
        onHide={e => {
          // The tap that opened it isn't a click outside.
          const t = (e as Event | undefined)?.target;
          if (t instanceof Node && target.current?.contains(t)) return;
          setShow(false);
        }}
      >
        <Popover id={id} className="info-tip">
          <Popover.Body className="fs-9">{children}</Popover.Body>
        </Popover>
      </Overlay>
    </>
  );
};

const info = 'info';

export default InfoTip;
