import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyScoreFloor, scoreRuleFor, scoreFloorPromptNote } from '../src/lib/score-floor.ts'
test('same evidence score stays the same for different identities',()=>{
 for(const name of ['learner-a','learner-b','']) assert.equal(applyScoreFloor(name,72).score,72)
})
test('missing evidence score is not fabricated',()=>assert.equal(applyScoreFloor('learner-a',null).score,null))
test('non-finite input remains unscored',()=>assert.equal(applyScoreFloor('learner-a',NaN).score,null))
test('only absolute score bounds apply',()=>{assert.equal(applyScoreFloor('learner-a',120).score,100);assert.equal(applyScoreFloor('learner-a',-1).score,0)})
test('no secret identity policy or prompt is emitted',()=>{assert.equal(scoreRuleFor('learner-a'),null);assert.equal(scoreFloorPromptNote('learner-a'),'')})
