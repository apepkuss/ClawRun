import React, { useState, useEffect } from 'react';
import { useLocale } from '../locales';

interface Props {
  open: boolean;
  onClose: () => void;
  onBurned: () => void;
}

type Step = 'display' | 'verify' | 'done';

interface VerifyQuestion {
  position: number; // 1-based
  answer: string;
}

function pickRandomPositions(totalWords: number, count: number): number[] {
  const positions: number[] = [];
  while (positions.length < count) {
    const pos = Math.floor(Math.random() * totalWords) + 1;
    if (!positions.includes(pos)) positions.push(pos);
  }
  return positions.sort((a, b) => a - b);
}

export function MnemonicDialog({ open, onClose, onBurned }: Props) {
  const { t } = useLocale();
  const [step, setStep] = useState<Step>('display');
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [questions, setQuestions] = useState<VerifyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep('display');
      setMnemonic(null);
      setWords([]);
      setQuestions([]);
      setAnswers({});
      setError('');
      return;
    }
    // Fetch mnemonic
    fetch('/api/openclaw/plugins/clawrouter/mnemonic')
      .then((res) => res.json())
      .then((data) => {
        if (data.mnemonic) {
          setMnemonic(data.mnemonic);
          const w = data.mnemonic.split(/\s+/);
          setWords(w);
          setQuestions(pickRandomPositions(w.length, Math.min(3, w.length)).map((p) => ({ position: p, answer: '' })));
        } else {
          // Already burned
          setStep('done');
        }
      })
      .catch(() => setError('Failed to load mnemonic'));
  }, [open]);

  async function handleVerify() {
    setError('');
    setLoading(true);
    try {
      const payload = questions.map((q) => ({
        position: q.position,
        word: answers[q.position]?.trim().toLowerCase() ?? '',
      }));
      const res = await fetch('/api/openclaw/plugins/clawrouter/mnemonic/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: payload }),
      });
      if (res.ok) {
        setStep('done');
        onBurned();
      } else {
        setError(t('mnemonic.verifyFailed'));
      }
    } catch {
      setError(t('mnemonic.verifyFailed'));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 p-6">
        {step === 'display' && mnemonic && (
          <>
            <h3 className="text-lg font-bold text-gray-800 mb-2">{t('mnemonic.title')}</h3>
            <p className="text-sm text-red-600 mb-4">{t('mnemonic.warning')}</p>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {words.map((w, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
                  <span className="text-sm font-mono text-gray-700">{w}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setStep('verify')}
              className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('mnemonic.continue')}
            </button>
          </>
        )}

        {step === 'verify' && (
          <>
            <h3 className="text-lg font-bold text-gray-800 mb-2">{t('mnemonic.verifyTitle')}</h3>
            <p className="text-sm text-gray-500 mb-4">{t('mnemonic.verifyDesc')}</p>
            <div className="space-y-3 mb-4">
              {questions.map((q) => (
                <div key={q.position}>
                  <label className="block text-xs text-gray-500 mb-1">
                    {t('mnemonic.wordN', { n: String(q.position) })}
                  </label>
                  <input
                    type="text"
                    value={answers[q.position] ?? ''}
                    onChange={(e) => setAnswers({ ...answers, [q.position]: e.target.value })}
                    placeholder={`Word #${q.position}`}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-300 focus:outline-none"
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setStep('display'); setError(''); }}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('common.back')}
              </button>
              <button
                onClick={handleVerify}
                disabled={loading || questions.some((q) => !answers[q.position]?.trim())}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? t('common.saving') : t('mnemonic.verify')}
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <h3 className="text-lg font-bold text-gray-800 mb-2">{t('mnemonic.title')}</h3>
            <p className="text-sm text-green-600 mb-4">{t('mnemonic.burned')}</p>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('common.back')}
            </button>
          </>
        )}

        {!mnemonic && step === 'display' && !error && (
          <p className="text-sm text-gray-400 text-center py-8">{t('common.loading')}</p>
        )}
        {!mnemonic && step === 'display' && error && (
          <div>
            <p className="text-sm text-red-500 text-center py-4">{error}</p>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('common.back')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
