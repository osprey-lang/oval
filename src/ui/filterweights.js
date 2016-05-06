/*
 * This file defines the weights of filter matches. The weights are mostly arbitrary
 * numbers and can be tweaked somewhat. The desired ordering is something like this:
 *
 *   1. Full name matches
 *   2. Matches at start of name
 *   3. Partial name matches
 *
 * It is possible to search for dotted components, e.g. "osprey.compiler.Expression",
 * in which case the entire path of each member will be matched against each component,
 * a bit like a CSS selector. Paths nearest the last component are scored higher than
 * paths further away. For example, given the query "syntax.Expression":
 *
 *   1. `osprey.compiler.syntax.Expression` (full name match + short distance between
 *      `syntax` and `Expression`)
 *   2. `osprey.compiler.syntax.ExpressionStatement.expression` (full name match, but
 *      longer distance)
 *   3. `osprey.compiler.syntax.ExpressionStatement` (start-of-name match + short
 *      distance)
 *   4. `osprey.copmiler.syntax.AssignmentExpression` (partial name match + short
 *      distance)
 *
 * And so on. In these examples, `syntax` is a full name match as well. The weight of
 * an ancestor's name match goes down the further we get from (1) the previous member,
 * (2) the first member. The appropriate multiplier is returned by `getAncestorFactor`.
 */

export const FilterWeights = Object.freeze({
	// Full name match.
	NAME_FULL: 50,
	// Match at start of name, e.g. "Expression" inside "ExpressionStatement".
	NAME_START: 25,
	// Partial name match, e.g. "expr" inside "parseExpression". The further down the name
	// the match is, the less the score is. But it's at least NAME_PARTIAL_BASE.
	NAME_PARTIAL: 10,
	NAME_PARTIAL_BASE: 5,

	/**
	 * Calculates the appropriate multiplier for the match of an ancestor member.
	 *
	 * @param {number} distanceFromStart  Number of steps from the start member, where
	 *                 0 means "at start member". The further away the ancestor is, the
	 *                 lower the score.
	 * @param {number} distanceFromPrevious  Number of steps from the previous matching
	 *                 member, where 0 means "self", 1 means "parent", 2 means "grandparent",
	 *                 and so on. The further away the ancestor is, the lower the score.
	 * @return {number}
	 */
	getAncestorFactor(distanceFromStart, distanceFromPrevious) {
		// Constant lowest weight after 5
		distanceFromStart = Math.min(distanceFromStart, 5);
		// Same with this, but after 3.
		distanceFromPrevious = Math.min(distanceFromPrevious, 2);

		var factor = 1 - 0.8 * (distanceFromStart / 5);

		if (distanceFromPrevious > 0) {
			factor -= 0.2 * (distanceFromPrevious / 2);
		}

		return Math.max(factor, 0.2);
	}
});
