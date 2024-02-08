import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import z from 'zod';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { voting } from '../../utils/voting-pub-sub';

export async function voteOnPoll(app: FastifyInstance) {
  app.post('/polls/:pollId/votes', async (request, reply) => {
    const voteOnPoolBody = z.object({
      pollOptionId: z.string().uuid(),
    });

    const voteOnPoolParams = z.object({
      pollId: z.string().uuid(),
    });

    const { pollId } = voteOnPoolParams.parse(request.params);
    const { pollOptionId } = voteOnPoolBody.parse(request.body);

    let { sessionId } = request.cookies;

    if (sessionId) {
      const userHasVotedOnPoll = await prisma.vote.findUnique({
        where: {
          sessionId_pollId: {
            pollId,
            sessionId,
          },
        },
      });

      if (userHasVotedOnPoll) {
        if (userHasVotedOnPoll.pollOptionId === pollOptionId) {
          return reply
            .status(400)
            .send({ message: 'You already voted in this poll.' });
        }

        await prisma.vote.delete({
          where: {
            id: userHasVotedOnPoll.id,
          },
        });

        const votes = await redis.zincrby(
          pollId,
          -1,
          userHasVotedOnPoll.pollOptionId
        );

        voting.publish(pollId, {
          pollOptionId: userHasVotedOnPoll.pollOptionId,
          votes: Number(votes),
        });
      }
    }

    if (!sessionId) {
      sessionId = randomUUID();

      reply.setCookie('sessionId', sessionId, {
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        signed: true,
        httpOnly: true,
      });
    }

    await prisma.vote.create({
      data: {
        sessionId,
        pollId,
        pollOptionId,
      },
    });

    const votes = await redis.zincrby(pollId, 1, pollOptionId);

    voting.publish(pollId, { pollOptionId, votes: Number(votes) });

    return reply.status(201).send({ sessionId });
  });
}
