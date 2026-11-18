import FeatherIcon from 'components/base/FeatherIcon';
import SectionCard from 'components/common/SectionCard';
import StakeLookup from 'components/stake/StakeLookup';
import { Col, Row } from 'react-bootstrap';

/** The Stake explorer's front door (/stake, staging only). */
const StakeExplorer = () => {
  const what: Array<{ icon: string; title: string; text: string }> = [
    {
      icon: 'layers',
      title: 'Stake account',
      text: 'Every epoch it existed: the validator it was delegated to, its stake and rewards, when it moved, and who controls it.'
    },
    {
      icon: 'key',
      title: 'Staker or withdrawer',
      text: 'Every stake account it controls and where that stake sits, epoch by epoch. Coming next.'
    },
    {
      icon: 'server',
      title: 'Validator',
      text: 'By name, vote account or identity: its stake, delegators and commission every epoch, and every delegation with what changed.'
    }
  ];

  return (
    <div className="mb-9">
      <div className="page-header row g-3 align-items-start">
        <div className="col-auto">
          <h1 className="h3">Stake Explorer</h1>
          <p className="text-body-tertiary lh-sm mb-0 mt-1">
            Look up any validator, stake account, staker or withdrawer, with its
            history every epoch
          </p>
        </div>
      </div>
      <div className="d-flex flex-column gap-3">
        <SectionCard title="Look up an address" icon="search">
          <StakeLookup />
        </SectionCard>

        <Row className="g-3">
          {what.map(w => (
            <Col key={w.title} xs={12} md={4}>
              <div className="h-100 rounded border border-translucent bg-body-emphasis p-3">
                <div className="d-flex align-items-center gap-2 fw-semibold mb-1">
                  <FeatherIcon
                    icon={w.icon}
                    size={16}
                    className="text-primary"
                  />
                  {w.title}
                </div>
                <p className="fs-9 text-body-secondary mb-0">{w.text}</p>
              </div>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  );
};

export default StakeExplorer;
