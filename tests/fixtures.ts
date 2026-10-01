import type { Messages } from '../core/text.js';

export const sampleManifest = {
  version: 1,
  manifestRev: 3,
  language: 'ko',
  owner: { env: 'TELEGRAM_CHAT_ID' },
  menus: [
    { id: 'main', title: 'main.title', items: [{ action: 'status.show' }, { menu: 'jobs' }, { menu: 'settings' }, { menu: 'status' }] },
    {
      id: 'jobs',
      title: 'jobs.title',
      items: [
        { action: 'jobs.list' },
        { action: 'jobs.mode', args: ['off', 'fast'] },
        { action: 'jobs.add' },
        { action: 'jobs.purge' },
      ],
    },
  ],
  actions: [
    { id: 'status.show', label: 'status.btn', risk: 'read', command: 'now' },
    { id: 'jobs.list', label: 'jobs.list', risk: 'read', command: 'jobs' },
    { id: 'jobs.mode', label: 'jobs.mode', risk: 'write', arg: { kind: 'enum' } },
    { id: 'jobs.add', label: 'jobs.add', risk: 'write', command: 'add', arg: { kind: 'number', prompt: 'jobs.add.ask' } },
    { id: 'jobs.purge', label: 'jobs.purge', risk: 'danger', command: 'purge', confirmPhrase: 'PURGE' },
  ],
  settings: {
    categories: [{ id: 'gen', title: 'set.gen' }],
    fields: [
      { id: 'jobs.enabled', path: 'jobs.enabled', category: 'gen', label: 'set.enabled', kind: 'boolean', apply: 'live' },
      { id: 'jobs.level', path: 'jobs.level', category: 'gen', label: 'set.level', kind: 'enum', options: ['low', 'high'], apply: 'live' },
      { id: 'jobs.share', path: 'jobs.share', category: 'gen', label: 'set.share', kind: 'float', ratio: true, min: 0, max: 1, apply: 'restart' },
      { id: 'jobs.limit', path: 'jobs.limit', category: 'gen', label: 'set.limit', kind: 'int', min: 1, max: 50, apply: 'live' },
    ],
    excluded: [],
  },
  alerts: [{ id: 'job.done', template: 'alert.jobDone', mutable: true }, { id: 'job.crash', template: 'alert.jobCrash', mutable: false }],
  status: { fields: ['jobs.today', 'jobs.queue'] },
} as const;

export const sampleMessages: Messages = {
  'main.title': '메인',
  'jobs.title': '작업',
  'status.btn': '지금 상태',
  'jobs.list': '작업 목록',
  'jobs.mode': '모드',
  'jobs.add': '작업 추가',
  'jobs.add.ask': '몇 개를 추가할까요?',
  'jobs.purge': '전체 삭제',
  'set.gen': '일반',
  'set.enabled': '작업 켜기',
  'set.level': '수준',
  'set.share': '비율',
  'set.limit': '한도',
  'alert.jobDone': '작업 {name} 완료',
  'alert.jobCrash': '작업 {name} 중단',
  'status.jobs.today': '오늘 작업',
  'status.jobs.queue': '대기열',
};
