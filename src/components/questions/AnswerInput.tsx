/**
 * Answer Input Component
 * Main component that switches between input types based on question type
 */

import React from 'react';
import {Question} from '@utils/types';
import {TextAnswerInput} from './TextAnswerInput';
import {VoiceAnswerInput} from './VoiceAnswerInput';
import {PhotoAnswerInput} from './PhotoAnswerInput';
import {MultipleChoiceInput} from './MultipleChoiceInput';
import {ThisOrThatInput} from './ThisOrThatInput';

interface AnswerInputProps {
  question: Question;
  onSubmit: (answer: string, mediaUrl?: string) => void;
  disabled?: boolean;
}

export const AnswerInput: React.FC<AnswerInputProps> = ({
  question,
  onSubmit,
  disabled = false,
}) => {
  switch (question.type) {
    case 'text':
      return (
        <TextAnswerInput
          question={question}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );
    case 'voice':
      return (
        <VoiceAnswerInput
          question={question}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );
    case 'photo':
      return (
        <PhotoAnswerInput
          question={question}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );
    case 'multiple_choice':
      return (
        <MultipleChoiceInput
          question={question}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );
    case 'this_or_that':
      return (
        <ThisOrThatInput
          question={question}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );
    default:
      return (
        <TextAnswerInput
          question={question}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );
  }
};
