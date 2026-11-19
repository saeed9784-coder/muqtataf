import { sql, type SQL } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

export const sources = pgTable('sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  siteUrl: text('site_url').notNull(),
  feedUrl: text('feed_url').notNull().unique(),
  image: text('image'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: createdAt(),
});

export const posts = pgTable(
  'posts',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    url: text('url').notNull().unique(),
    title: text('title').notNull(),
    summary: text('summary'),
    image: text('image'),
    readTime: integer('read_time'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: createdAt(),
    upvotes: integer('upvotes').notNull().default(0),
    comments: integer('comments').notNull().default(0),
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${posts.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${posts.summary}, '')), 'B')`,
    ),
  },
  (t) => [
    index('posts_published_idx').on(t.publishedAt.desc(), t.id),
    index('posts_source_idx').on(t.sourceId, t.publishedAt.desc()),
    index('posts_search_idx').using('gin', t.searchVector),
  ],
);

export const postTags = pgTable(
  'post_tags',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tag] }), index('post_tags_tag_idx').on(t.tag)],
);

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  name: text('name').notNull(),
  image: text('image'),
  createdAt: createdAt(),
});

const userPostTable = (name: string) =>
  pgTable(
    name,
    {
      userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
      postId: text('post_id')
        .notNull()
        .references(() => posts.id, { onDelete: 'cascade' }),
      createdAt: createdAt(),
    },
    (t) => [primaryKey({ columns: [t.userId, t.postId] })],
  );

export const upvotes = userPostTable('upvotes');
export const bookmarks = userPostTable('bookmarks');

export const comments = pgTable(
  'comments',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('comments_post_idx').on(t.postId, t.createdAt)],
);

/** kind is 'tag' or 'source'; value is the tag name or source id. */
export const follows = pgTable(
  'follows',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['tag', 'source'] }).notNull(),
    value: text('value').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.value] })],
);
