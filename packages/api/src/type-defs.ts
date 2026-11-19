export const typeDefs = /* GraphQL */ `
  enum FeedType {
    POPULAR
    LATEST
    MY
  }

  enum FollowKind {
    TAG
    SOURCE
  }

  type Source {
    id: ID!
    name: String!
    siteUrl: String!
    image: String
  }

  type Post {
    id: ID!
    url: String!
    title: String!
    summary: String
    image: String
    readTime: Int
    publishedAt: String!
    source: Source!
    tags: [String!]!
    upvotes: Int!
    commentsCount: Int!
    upvoted: Boolean!
    bookmarked: Boolean!
  }

  type PostPage {
    nodes: [Post!]!
    nextCursor: String
  }

  type Author {
    id: ID!
    name: String!
    image: String
  }

  type Comment {
    id: ID!
    content: String!
    createdAt: String!
    author: Author!
    canDelete: Boolean!
  }

  type TagCount {
    name: String!
    posts: Int!
  }

  type Me {
    id: ID!
    name: String!
    image: String
    followedTags: [String!]!
    followedSources: [String!]!
  }

  type Query {
    feed(type: FeedType!, first: Int, after: String): PostPage!
    sourceFeed(sourceId: ID!, first: Int, after: String): PostPage!
    tagFeed(tag: String!, first: Int, after: String): PostPage!
    search(query: String!, first: Int, after: String): PostPage!
    bookmarks(first: Int, after: String): PostPage!
    post(id: ID!): Post
    comments(postId: ID!): [Comment!]!
    sources: [Source!]!
    source(id: ID!): Source
    tags(first: Int): [TagCount!]!
    me: Me
  }

  type Mutation {
    toggleUpvote(postId: ID!): Post!
    toggleBookmark(postId: ID!): Post!
    addComment(postId: ID!, content: String!): Comment!
    deleteComment(id: ID!): Boolean!
    follow(kind: FollowKind!, value: String!): Me!
    unfollow(kind: FollowKind!, value: String!): Me!
  }
`;
