import DelayedSpinner from 'components/common/DelayedSpinner';
import PageSection from 'components/common/PageSection';
import SectionCard from 'components/common/SectionCard';
import UntrackedState from 'components/common/UntrackedState';
import BlackholeVoters from 'components/validator/BlackholeVoters';
import ConsensusRecordHeader from 'components/validator/ConsensusRecordHeader';
import ProducerWindowsTable from 'components/validator/ProducerWindowsTable';
import ProducingSection from 'components/validator/ProducingSection';
import RecordSummary from 'components/validator/RecordSummary';
import { consensusPath } from 'helpers/consensusBoards';
import { clockLine, clockVerdict } from 'helpers/producerClock';
import WarningBanner from 'components/common/WarningBanner';
import useConsensusRecord from 'hooks/useConsensusRecord';
import useRecordBoards from 'hooks/useRecordBoards';

/**
 * A validator's production record for one epoch: the rewards summary,
 * its production cards (rank, inclusion, Perfect / Poor blocks, leader
 * slots, producer bonus), the next leader windows live (current epoch),
 * voters its blocks never include, and each of its leader slots - block
 * or skipped, and the share of the online stake each block carried
 * (/epochs/production/windows, paged).
 */
const ValidatorProducedBlocks = () => {
  const {
    alpenglowActive,
    cutoverEpoch,
    known,
    unavailable,
    address,
    identity,
    voteAddress,
    recordKey,
    epoch,
    currentEpoch,
    row
  } = useConsensusRecord({ timeline: false });
  const { producerBoard, ranked, prodRanks } = useRecordBoards(
    alpenglowActive,
    epoch,
    voteAddress
  );
  const name = identity?.displayName ?? 'Validator';
  // Its producer record: via the Overall ranking, else straight from the
  // board (a producer that wasn't admitted to vote still produces).
  const producer =
    ranked?.producer ??
    producerBoard?.records.find(p => p.nodeAddress === identity?.nodeAddress);
  const leaderLink = consensusPath('production', epoch, currentEpoch);

  return (
    <div>
      <ConsensusRecordHeader
        address={address}
        name={name}
        nodeAddress={identity?.nodeAddress}
        epoch={epoch}
        currentEpoch={currentEpoch}
        cutoverEpoch={cutoverEpoch}
        page="blocks"
      />
      <div className="mb-9">
        {unavailable ? (
          <UntrackedState>The API is unavailable right now.</UntrackedState>
        ) : known && !alpenglowActive ? (
          <UntrackedState>
            Alpenglow isn&apos;t active on this cluster yet.
          </UntrackedState>
        ) : epoch == null || !recordKey ? null : (
          <>
            {row && (
              <RecordSummary
                row={row}
                epoch={epoch}
                voteAddress={voteAddress}
              />
            )}
            <PageSection>
              <div className="d-flex flex-column gap-3">
                {!producerBoard ? (
                  <DelayedSpinner loading label="Loading production…" />
                ) : (
                  <ProducingSection
                    record={producer}
                    cluster={producerBoard.cluster}
                    producingShare={ranked?.score?.producingShare}
                    rank={
                      producer
                        ? (prodRanks?.ranks.get(producer.nodeAddress) ?? null)
                        : null
                    }
                    rankedOf={prodRanks?.rankedOf ?? null}
                    rankLink={leaderLink}
                  />
                )}
                {clockVerdict(producer) && (
                  <WarningBanner icon="clock" className="mb-0">
                    {clockLine(clockVerdict(producer)!)}
                  </WarningBanner>
                )}
                <BlackholeVoters voteKey={recordKey} epoch={epoch} />
                {(producer || !producerBoard) && (
                  <SectionCard
                    title="Leader Slots"
                    icon="box"
                    info="Its leader windows (4 slots each), newest first: each slot's share of the online stake its block carried. Plain green is a full block (99.9%+); OK and Poor blocks show their share."
                  >
                    <ProducerWindowsTable
                      voteKey={recordKey}
                      epoch={epoch}
                      nodeAddress={identity?.nodeAddress}
                      current={epoch === currentEpoch}
                    />
                  </SectionCard>
                )}
              </div>
            </PageSection>
          </>
        )}
      </div>
    </div>
  );
};

export default ValidatorProducedBlocks;
